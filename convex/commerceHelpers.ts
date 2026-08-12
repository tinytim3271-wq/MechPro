import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

// ─── Internal helper: get user by token ────────────────────────────────────────

export const getUser = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
  },
});

// ─── Internal helper: set commerce customer ID ─────────────────────────────────

export const setCustomerId = internalMutation({
  args: {
    userId: v.id("users"),
    commerceCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { commerceCustomerId: args.commerceCustomerId });
  },
});

export const getOrgMembership = internalQuery({
  args: {
    orgId: v.id("organizations"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", args.orgId).eq("userId", args.userId))
      .first();
  },
});

// ─── Internal helper: check if user is an active org member (employee access) ──

export const getOrgOwnerForMember = internalQuery({
  args: { tokenIdentifier: v.string() },
  handler: async (ctx, args) => {
    // Find user
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
      .unique();
    if (!user) return null;

    // Find any active org membership for this user
    const membership = await ctx.db
      .query("orgMembers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!membership || !membership.isActive) return null;

    // Get the org and its owner
    const org = await ctx.db.get(membership.orgId);
    if (!org) return null;

    const owner = await ctx.db.get(org.ownerId);
    return owner;
  },
});
