import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel.d.ts";
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

// List all active members for an org with their user details
export const listMembers = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Require auth + membership in the org
    const user = await getAuthedUser(ctx);
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
        return {
          ...m,
          userName: user?.name ?? m.inviteEmail ?? "Unknown",
          userEmail: user?.email ?? m.inviteEmail,
          userPhone: user?.phone,
          avatarUrl: user?.avatarUrl,
        };
      })
    );
  },
});

// Update a member's role, active status, or employment type
export const updateMember = mutation({
  args: {
    memberId: v.id("orgMembers"),
    role: v.optional(
      v.union(
        v.literal("admin"),
        v.literal("service_writer"),
        v.literal("mechanic"),
        v.literal("mobile_mechanic")
      )
    ),
    isActive: v.optional(v.boolean()),
    employmentType: v.optional(v.union(v.literal("w2"), v.literal("1099"))),
    locationId: v.optional(v.union(v.id("locations"), v.null())),
    hasAdminAccess: v.optional(v.boolean()),
    hourlyRate: v.optional(v.number()),
    annualSalary: v.optional(v.number()),
    hireDate: v.optional(v.string()),
    ssnLast4: v.optional(v.string()),
    taxIdLast4: v.optional(v.string()),
    payAddress: v.optional(v.string()),
    jobTitle: v.optional(v.string()),
    department: v.optional(v.string()),
    filingStatus: v.optional(
      v.union(v.literal("single"), v.literal("married"), v.literal("headOfHousehold")),
    ),
    overtimeMultiplier: v.optional(v.number()),
    stateTaxRate: v.optional(v.number()),
    payFrequency: v.optional(
      v.union(
        v.literal("weekly"),
        v.literal("biweekly"),
        v.literal("semimonthly"),
        v.literal("monthly"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);

    // Verify target member exists and get their org
    const targetMember = await ctx.db.get(args.memberId);
    if (!targetMember) throw new ConvexError({ message: "Member not found", code: "NOT_FOUND" });

    // Require caller is owner/admin of the same org
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", targetMember.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
    }

    // Prevent changing the owner's role
    if (targetMember.role === "owner" && args.role !== undefined) {
      throw new ConvexError({ message: "Cannot change the owner's role", code: "FORBIDDEN" });
    }

    const { memberId, ...updates } = args;
    // Filter out undefined values to avoid overwriting with undefined
    const patch: Record<string, unknown> = {};
    if (updates.role !== undefined) patch.role = updates.role;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;
    if (updates.employmentType !== undefined) patch.employmentType = updates.employmentType;
    if (updates.locationId !== undefined) patch.locationId = updates.locationId ?? undefined;
    if (updates.hasAdminAccess !== undefined) patch.hasAdminAccess = updates.hasAdminAccess;
    if (updates.hourlyRate !== undefined) patch.hourlyRate = updates.hourlyRate;
    if (updates.annualSalary !== undefined) patch.annualSalary = updates.annualSalary;
    if (updates.hireDate !== undefined) patch.hireDate = updates.hireDate;
    if (updates.ssnLast4 !== undefined) {
      const digits = updates.ssnLast4.replace(/\D/g, "");
      patch.ssnLast4 = digits.length >= 4 ? digits.slice(-4) : undefined;
    }
    if (updates.taxIdLast4 !== undefined) {
      const digits = updates.taxIdLast4.replace(/\D/g, "");
      patch.taxIdLast4 = digits.length >= 4 ? digits.slice(-4) : undefined;
    }
    if (updates.payAddress !== undefined) patch.payAddress = updates.payAddress;
    if (updates.jobTitle !== undefined) patch.jobTitle = updates.jobTitle;
    if (updates.department !== undefined) patch.department = updates.department;
    if (updates.filingStatus !== undefined) patch.filingStatus = updates.filingStatus;
    if (updates.overtimeMultiplier !== undefined) patch.overtimeMultiplier = updates.overtimeMultiplier;
    if (updates.stateTaxRate !== undefined) patch.stateTaxRate = updates.stateTaxRate;
    if (updates.payFrequency !== undefined) patch.payFrequency = updates.payFrequency;
    await ctx.db.patch(memberId, patch);
  },
});

// Update employee user profile (name, email, phone)
export const updateMemberProfile = mutation({
  args: {
    memberId: v.id("orgMembers"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError({ message: "Member not found", code: "NOT_FOUND" });

    // Allow editing own profile OR require admin/owner
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", member.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    const isSelf = callerMember._id === args.memberId;
    if (!isSelf && callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required to edit other profiles", code: "FORBIDDEN" });
    }

    const patch: Record<string, string | undefined> = {};
    if (args.name !== undefined) patch.name = args.name;
    if (args.email !== undefined) patch.email = args.email;
    if (args.phone !== undefined) patch.phone = args.phone;

    await ctx.db.patch(member.userId, patch);
  },
});

// Remove a member from the org (deactivate)
export const removeMember = mutation({
  args: { memberId: v.id("orgMembers") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const targetMember = await ctx.db.get(args.memberId);
    if (!targetMember) throw new ConvexError({ message: "Member not found", code: "NOT_FOUND" });

    // Require caller is owner/admin of the same org
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", targetMember.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
    }

    // Prevent removing the owner
    if (targetMember.role === "owner") {
      throw new ConvexError({ message: "Cannot remove the owner", code: "FORBIDDEN" });
    }

    await ctx.db.patch(args.memberId, { isActive: false });
  },
});

// Permanently revoke a pending invite (delete the record entirely)
export const revokeInvite = mutation({
  args: { memberId: v.id("orgMembers") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member) throw new ConvexError({ message: "Member not found", code: "NOT_FOUND" });
    if (member.inviteStatus !== "pending") {
      throw new ConvexError({ message: "Can only revoke pending invites", code: "BAD_REQUEST" });
    }

    // Require caller is owner/admin of the same org
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", member.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }
    if (callerMember.role !== "owner" && callerMember.role !== "admin" && !callerMember.hasAdminAccess) {
      throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
    }

    await ctx.db.delete(args.memberId);
  },
});

// Record a GPS location ping for the current user's member record
export const recordLocation = mutation({
  args: {
    orgId: v.id("organizations"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    roId: v.optional(v.id("repairOrders")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);

    // Find the orgMember record for this user
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .unique();
    if (!member) throw new ConvexError({ message: "Not a member of this org", code: "FORBIDDEN" });

    await ctx.db.insert("locationPings", {
      orgId: args.orgId,
      memberId: member._id,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: new Date().toISOString(),
      roId: args.roId,
    });
  },
});

// Get latest location ping for each active mobile_mechanic in the org
export const getLatestLocations = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    // Require auth + membership in the org
    const user = await getAuthedUser(ctx);
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

    const activeMobile = members.filter(
      (m) => m.isActive && (m.role === "mobile_mechanic" || m.role === "mechanic")
    );

    const results = await Promise.all(
      activeMobile.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        // Get last ping for this member
        const lastPing = await ctx.db
          .query("locationPings")
          .withIndex("by_member_timestamp", (q) => q.eq("memberId", m._id))
          .order("desc")
          .first();

        return {
          memberId: m._id,
          userId: m.userId,
          role: m.role,
          userName: user?.name ?? "Unknown",
          avatarUrl: user?.avatarUrl,
          lastPing: lastPing ?? null,
        };
      })
    );

    return results;
  },
});

// Get location history for a specific member (last 50 pings)
export const getMemberLocationHistory = query({
  args: { memberId: v.id("orgMembers") },
  handler: async (ctx, args) => {
    // Require auth + membership in the same org
    const user = await getAuthedUser(ctx);
    const targetMember = await ctx.db.get(args.memberId);
    if (!targetMember) throw new ConvexError({ message: "Member not found", code: "NOT_FOUND" });
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", targetMember.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }

    return await ctx.db
      .query("locationPings")
      .withIndex("by_member_timestamp", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .take(50);
  },
});

// Get active repair orders assigned to a member
export const getMemberAssignedJobs = query({
  args: { orgId: v.id("organizations"), memberId: v.id("orgMembers") },
  handler: async (ctx, args) => {
    // Require auth + membership in the org
    const user = await getAuthedUser(ctx);
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!callerMember || !callerMember.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }

    const all = await ctx.db
      .query("repairOrders")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", args.orgId).eq("status", "in_progress")
      )
      .collect();
    return all.filter((ro) => ro.assignedTo === args.memberId);
  },
});
