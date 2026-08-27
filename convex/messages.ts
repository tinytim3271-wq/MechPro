import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc } from "./_generated/dataModel.d.ts";
import { assertOrgResource, getActiveMembership, requireActiveMembership } from "./authorization";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthedMember(ctx: QueryCtx | MutationCtx) {
  return requireActiveMembership(ctx);
}

const TECH_ROLES = ["mechanic", "mobile_mechanic"];

// ─── Send a message on an RO ──────────────────────────────────────────────────

export const send = mutation({
  args: {
    roId: v.id("repairOrders"),
    body: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const { user, member, orgId } = await getAuthedMember(ctx);

    if (!args.body.trim()) {
      throw new ConvexError({ message: "Message cannot be empty", code: "BAD_REQUEST" });
    }

    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    const isTech = TECH_ROLES.includes(member.role);
    const senderName = user.name ?? user.email ?? "Unknown";

    await ctx.db.insert("roMessages", {
      orgId,
      roId: args.roId,
      senderId: member._id,
      senderName,
      senderRole: member.role,
      body: args.body.trim(),
      readByOffice: !isTech, // If sender is office, mark as read by office
      readByTech: isTech, // If sender is tech, mark as read by tech
    });

    return { success: true };
  },
});

// ─── Get messages for an RO ───────────────────────────────────────────────────

export const getByRO = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<Array<Doc<"roMessages">>> => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return [];
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== membership.orgId) return [];

    const messages = await ctx.db
      .query("roMessages")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .order("asc")
      .collect();

    return messages;
  },
});

// ─── Mark messages as read (for office staff viewing RO messages) ─────────────

export const markReadByOffice = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ count: number }> => {
    const { orgId } = await getAuthedMember(ctx);
    assertOrgResource(await ctx.db.get(args.roId), orgId, "Repair order");

    const unread = await ctx.db
      .query("roMessages")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    let count = 0;
    for (const msg of unread) {
      if (!msg.readByOffice) {
        await ctx.db.patch(msg._id, { readByOffice: true });
        count++;
      }
    }
    return { count };
  },
});

// ─── Mark messages as read (for tech viewing their messages) ──────────────────

export const markReadByTech = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ count: number }> => {
    const { orgId } = await getAuthedMember(ctx);
    assertOrgResource(await ctx.db.get(args.roId), orgId, "Repair order");

    const unread = await ctx.db
      .query("roMessages")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    let count = 0;
    for (const msg of unread) {
      if (!msg.readByTech) {
        await ctx.db.patch(msg._id, { readByTech: true });
        count++;
      }
    }
    return { count };
  },
});

// ─── Get unread message count for an RO (for office badge) ────────────────────

export const getUnreadCountForRO = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<number> => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return 0;
    const { member, orgId } = membership;
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== orgId) return 0;

    const isTech = TECH_ROLES.includes(member.role);
    const messages = await ctx.db
      .query("roMessages")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    return messages.filter((m) =>
      isTech ? !m.readByTech : !m.readByOffice
    ).length;
  },
});

// ─── Get total unread message count for tech (across all their ROs) ───────────

export const getTechUnreadTotal = query({
  args: {},
  handler: async (ctx): Promise<number> => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return 0;
    const { member, orgId } = membership;

    // Get all messages in this org where tech hasn't read
    const messages = await ctx.db
      .query("roMessages")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    // Only count messages on ROs assigned to this tech
    let count = 0;
    for (const msg of messages) {
      if (!msg.readByTech && msg.senderId !== member._id) {
        const ro = await ctx.db.get(msg.roId);
        if (ro?.assignedTo === member._id) {
          count++;
        }
      }
    }
    return count;
  },
});

// ─── Get total unread count for office (messages from techs not yet read) ────

export const getOfficeUnreadTotal = query({
  args: {},
  handler: async (ctx): Promise<{ count: number; latest: { senderName: string; body: string; roId: string } | null }> => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return { count: 0, latest: null };
    const { member, orgId } = membership;

    // Only office staff get notified of tech messages
    const isTech = TECH_ROLES.includes(member.role);
    if (isTech) return { count: 0, latest: null };

    const messages = await ctx.db
      .query("roMessages")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(200);

    let count = 0;
    let latest: { senderName: string; body: string; roId: string } | null = null;

    for (const msg of messages) {
      if (!msg.readByOffice) {
        count++;
        if (!latest) {
          latest = { senderName: msg.senderName, body: msg.body, roId: msg.roId };
        }
      }
    }

    return { count, latest };
  },
});
