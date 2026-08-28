import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";

export const updateCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: identity.name,
        email: identity.email?.trim().toLowerCase(),
      });

      // Check for pending invites that match this user's email and claim them
      if (identity.email) {
        await claimPendingInvites(ctx, existing._id, identity.email);
        await claimPendingFreeAccess(ctx, existing._id, identity.email);
      }

      return existing._id;
    }

    // Create new user
    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name,
      email: identity.email?.trim().toLowerCase(),
    });

    // Check for pending invites matching this new user's email
    if (identity.email) {
      await claimPendingInvites(ctx, userId, identity.email);
      await claimPendingFreeAccess(ctx, userId, identity.email);
    }

    return userId;
  },
});

// Claims all pending org invites for this email address and activates them
async function claimPendingInvites(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();
  const pendingInvites = await ctx.db
    .query("orgMembers")
    .withIndex("by_invite_email", (q) => q.eq("inviteEmail", normalizedEmail))
    .collect();

  let firstOrgId: Id<"organizations"> | null = null;

  for (const invite of pendingInvites) {
    if (invite.inviteStatus !== "pending") continue;
    const pendingUserId = invite.userId;
    // Update the invite: set the real userId, activate membership, mark accepted
    await ctx.db.patch(invite._id, {
      userId,
      isActive: true,
      inviteStatus: "accepted" as const,
    });
    if (!firstOrgId) firstOrgId = invite.orgId;

    if (pendingUserId !== userId) {
      const pendingUser = await ctx.db.get(pendingUserId);
      if (pendingUser?.tokenIdentifier.startsWith("pending_invite:")) {
        const claimedUser = await ctx.db.get(userId);
        if (claimedUser && !claimedUser.name && pendingUser.name) {
          await ctx.db.patch(userId, { name: pendingUser.name });
        }
        await ctx.db.delete(pendingUserId);
      }
    }
  }

  // If the user doesn't have a currentOrgId yet, set it to the first accepted org
  if (firstOrgId) {
    const user = await ctx.db.get(userId);
    if (user && !user.currentOrgId) {
      await ctx.db.patch(userId, { currentOrgId: firstOrgId });
    }
  }
}

// Claims free access from a placeholder user record created via grantFreeAccessByEmail
async function claimPendingFreeAccess(
  ctx: MutationCtx,
  userId: Id<"users">,
  email: string,
) {
  const normalizedEmail = email.trim().toLowerCase();

  // Find placeholder records created by grantFreeAccessByEmail
  const allUsers = await ctx.db.query("users").collect();
  const placeholders = allUsers.filter(
    (u) =>
      u._id !== userId &&
      u.tokenIdentifier.startsWith("pending_email:") &&
      u.email?.toLowerCase() === normalizedEmail &&
      u.freeAccessUntil
  );

  for (const placeholder of placeholders) {
    // Transfer the free access to the real user
    const realUser = await ctx.db.get(userId);
    if (realUser && !realUser.freeAccessUntil) {
      await ctx.db.patch(userId, { freeAccessUntil: placeholder.freeAccessUntil });
    }
    // Delete the placeholder
    await ctx.db.delete(placeholder._id);
  }
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();
  },
});

export const setCurrentOrg = mutation({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });

    // Verify user is a member of the target org
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", user._id))
      .first();
    if (!membership || !membership.isActive) {
      throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
    }

    await ctx.db.patch(user._id, { currentOrgId: args.orgId });
  },
});
