import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { sanitizeOrgForClient } from "./orgSanitize";
import type { Id, Doc } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";

async function getAuthedUser(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

export const createOrg = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    bayCount: v.number(),
    laborRate: v.number(),
    taxRate: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);

    const bayNames = Array.from({ length: args.bayCount }, (_, i) => `Bay ${i + 1}`);

    const orgId = await ctx.db.insert("organizations", {
      name: args.name,
      ownerId: user._id,
      phone: args.phone,
      email: args.email,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      taxRate: args.taxRate,
      laborRate: args.laborRate,
      bayCount: args.bayCount,
      bayNames,
      isActive: true,
    });

    // Add owner as member
    await ctx.db.insert("orgMembers", {
      orgId,
      userId: user._id,
      role: "owner",
      isActive: true,
    });

    // Set as current org
    await ctx.db.patch(user._id, { currentOrgId: orgId });

    return orgId;
  },
});

type OrgRole = "owner" | "admin" | "service_writer" | "mechanic" | "mobile_mechanic";
type OrgListItem = { _id: Id<"organizations">; name: string; role: OrgRole };

export const getMyOrgs = query({
  args: {},
  handler: async (ctx): Promise<OrgListItem[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) return [];

    const memberships = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const results: OrgListItem[] = [];
    for (const m of memberships) {
      if (!m.isActive) continue;
      const org = await ctx.db.get(m.orgId);
      if (org) results.push({ _id: org._id, name: org.name, role: m.role });
    }
    return results;
  },
});

export const getCurrentOrg = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    const org = await ctx.db.get(user.currentOrgId);
    if (!org) return null;

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();

    return sanitizeOrgForClient(org, member?.role, member?.hasAdminAccess);
  },
});

export const updateOrg = mutation({
  args: {
    orgId: v.id("organizations"),
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    laborRate: v.optional(v.number()),
    bayCount: v.optional(v.number()),
    bayNames: v.optional(v.array(v.string())),
    smsEnabled: v.optional(v.boolean()),
    smsTemplateStart: v.optional(v.string()),
    smsTemplateComplete: v.optional(v.string()),
    carfaxEnabled: v.optional(v.boolean()),
    carfaxPartnerKey: v.optional(v.string()),
    carfaxLocationId: v.optional(v.string()),
    shopSupplyFeeEnabled: v.optional(v.boolean()),
    shopSupplyFeePercent: v.optional(v.number()),
    shopSupplyFeeCap: v.optional(v.number()),
    hazmatFeeEnabled: v.optional(v.boolean()),
    hazmatFeePercent: v.optional(v.number()),
    hazmatFeeCap: v.optional(v.number()),
    aiExternalProcessingEnabled: v.optional(v.boolean()),
    aiAuditRetentionDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Require auth + admin/owner role
    const user = await getAuthedUser(ctx);
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!member || !member.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (member.role !== "owner" && member.role !== "admin" && !member.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
    }

    const { orgId, ...fields } = args;
    const updates: Partial<typeof fields & { bayNames: string[] }> = { ...fields };

    // Auto-regenerate bayNames if bayCount changed but no custom names provided
    if (fields.bayCount !== undefined && fields.bayNames === undefined) {
      updates.bayNames = Array.from({ length: fields.bayCount }, (_, i) => `Bay ${i + 1}`);
    }

    if (fields.aiAuditRetentionDays !== undefined) {
      if (!Number.isInteger(fields.aiAuditRetentionDays) || fields.aiAuditRetentionDays < 1 || fields.aiAuditRetentionDays > 365) {
        throw new ConvexError({ message: "AI audit retention must be between 1 and 365 days", code: "BAD_REQUEST" });
      }
    }

    if (fields.aiExternalProcessingEnabled !== undefined) {
      Object.assign(updates, {
        aiConsentUpdatedAt: new Date().toISOString(),
        aiConsentUpdatedBy: user._id,
      });
    }

    await ctx.db.patch(orgId, updates);
  },
});

export const switchOrg = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    // Verify user is a member of the target org
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!membership?.isActive) throw new ConvexError({ message: "Not a member of this location", code: "FORBIDDEN" });
    await ctx.db.patch(user._id, { currentOrgId: args.orgId });
  },
});

export const getOrgMembers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Require auth + membership in the requested org
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return await Promise.all(
      members.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        return { ...m, userName: user?.name, userEmail: user?.email };
      })
    );
  },
});

export const validateEmployeeInvite = internalQuery({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    email: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!callerMember?.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required to invite members", code: "FORBIDDEN" });
    }

    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    if (!name) throw new ConvexError({ message: "Employee name is required", code: "BAD_REQUEST" });
    if (!email || !email.includes("@")) {
      throw new ConvexError({ message: "A valid employee email is required", code: "BAD_REQUEST" });
    }

    const invitee = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (invitee) {
      const membership = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", invitee._id))
        .unique();
      if (membership?.isActive) {
        throw new ConvexError({ message: "User is already a member", code: "CONFLICT" });
      }
    }

    const existingInvite = await ctx.db
      .query("orgMembers")
      .withIndex("by_invite_email", (q) => q.eq("inviteEmail", email))
      .filter((q) => q.eq(q.field("orgId"), args.orgId))
      .first();
    if (existingInvite?.inviteStatus === "pending") {
      throw new ConvexError({ message: "An invite is already pending for this email", code: "CONFLICT" });
    }

    return { name, email };
  },
});

export const inviteMember = internalMutation({
  args: {
    orgId: v.id("organizations"),
    name: v.string(),
    email: v.string(),
    role: v.union(
      v.literal("admin"),
      v.literal("service_writer"),
      v.literal("mechanic"),
      v.literal("mobile_mechanic")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);

    // Require owner/admin role to invite
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required to invite members", code: "FORBIDDEN" });
    }

    const org = await ctx.db.get(args.orgId);
    if (!org) throw new ConvexError({ message: "Organization not found", code: "NOT_FOUND" });

    // Normalize email to lowercase for consistent matching
    const employeeName = args.name.trim();
    const normalizedEmail = args.email.trim().toLowerCase();
    if (!employeeName) {
      throw new ConvexError({ message: "Employee name is required", code: "BAD_REQUEST" });
    }
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new ConvexError({ message: "A valid employee email is required", code: "BAD_REQUEST" });
    }

    // Find user by email (stored lowercase when possible)
    const invitee =
      (await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first()) ??
      (await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", args.email.trim()))
        .first());

    if (invitee) {
      // Check if already a member
      const existing = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("userId", invitee._id)
        )
        .unique();
      if (existing) {
        if (existing.isActive) {
          throw new ConvexError({ message: "User is already a member", code: "CONFLICT" });
        }
        // Re-activate a previously removed employee (rehire)
        await ctx.db.patch(existing._id, {
          role: args.role,
          isActive: true,
          inviteStatus: "accepted",
          inviteEmail: normalizedEmail,
        });
      } else {
        await ctx.db.insert("orgMembers", {
          orgId: args.orgId,
          userId: invitee._id,
          role: args.role,
          isActive: true,
          inviteEmail: normalizedEmail,
          inviteStatus: "accepted",
        });
      }

      // Set the employee's currentOrgId if they don't have one
      const inviteeUser = await ctx.db.get(invitee._id);
      if (inviteeUser && !inviteeUser.currentOrgId) {
        await ctx.db.patch(invitee._id, { currentOrgId: args.orgId });
      }
      if (inviteeUser && !inviteeUser.name) {
        await ctx.db.patch(invitee._id, { name: employeeName });
      }
    } else {
      // Check if there's already a pending invite for this email
      const existingInvite = await ctx.db
        .query("orgMembers")
        .withIndex("by_invite_email", (q) => q.eq("inviteEmail", normalizedEmail))
        .first();
      if (existingInvite && existingInvite.orgId === args.orgId && existingInvite.inviteStatus === "pending") {
        throw new ConvexError({ message: "An invite is already pending for this email", code: "CONFLICT" });
      }

      const pendingUserId = await ctx.db.insert("users", {
        tokenIdentifier: `pending_invite:${normalizedEmail}`,
        name: employeeName,
        email: normalizedEmail,
      });

      // Save a dedicated employee profile immediately; the pending user is
      // replaced with the authenticated Cognito user when the invite is claimed.
      await ctx.db.insert("orgMembers", {
        orgId: args.orgId,
        userId: pendingUserId,
        role: args.role,
        isActive: false,
        inviteEmail: normalizedEmail,
        inviteStatus: "pending",
      });
    }
  },
});