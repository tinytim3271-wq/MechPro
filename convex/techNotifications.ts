import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthedMember(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) {
    throw new ConvexError({ message: "No active organization", code: "FORBIDDEN" });
  }
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member) {
    throw new ConvexError({ message: "Not a member of this organization", code: "FORBIDDEN" });
  }
  return { user, member };
}

// ─── Get unread tech notifications ────────────────────────────────────────────

export const getUnread = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member) return [];

    const notifications = await ctx.db
      .query("techNotifications")
      .withIndex("by_member_unread", (q) => q.eq("memberId", member._id).eq("isRead", false))
      .order("desc")
      .take(20);

    return notifications;
  },
});

// ─── Get all tech notifications (including read) ──────────────────────────────

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member) return [];

    const notifications = await ctx.db
      .query("techNotifications")
      .withIndex("by_member", (q) => q.eq("memberId", member._id))
      .order("desc")
      .take(50);

    return notifications;
  },
});

// ─── Mark a single notification as read ───────────────────────────────────────

export const markRead = mutation({
  args: { notificationId: v.id("techNotifications") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    await getAuthedMember(ctx);
    await ctx.db.patch(args.notificationId, { isRead: true });
    return { success: true };
  },
});

// ─── Mark all notifications as read ──────────────────────────────────────────

export const markAllRead = mutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const { member } = await getAuthedMember(ctx);

    const unread = await ctx.db
      .query("techNotifications")
      .withIndex("by_member_unread", (q) => q.eq("memberId", member._id).eq("isRead", false))
      .take(100);

    for (const n of unread) {
      await ctx.db.patch(n._id, { isRead: true });
    }

    return { success: true };
  },
});
