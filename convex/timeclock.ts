import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";

async function getAuthedMember(ctx: MutationCtx | QueryCtx): Promise<{
  user: Doc<"users">;
  member: Doc<"orgMembers">;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  return { user, member };
}

// ─── Clock In ────────────────────────────────────────────────────────────────

export const clockIn = mutation({
  args: {
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);

    // Check if already clocked in (has open entry)
    const openEntry = await ctx.db
      .query("timeEntries")
      .withIndex("by_member_clockIn", (q) => q.eq("memberId", member._id))
      .order("desc")
      .first();

    if (openEntry && !openEntry.clockOutAt) {
      throw new ConvexError({ message: "Already clocked in. Clock out first.", code: "CONFLICT" });
    }

    await ctx.db.insert("timeEntries", {
      orgId: user.currentOrgId!,
      memberId: member._id,
      clockInAt: new Date().toISOString(),
      clockInLat: args.lat,
      clockInLng: args.lng,
      notes: args.notes,
    });

    // Also record a location ping on clock-in
    if (args.lat !== undefined && args.lng !== undefined) {
      await ctx.db.insert("locationPings", {
        orgId: user.currentOrgId!,
        memberId: member._id,
        lat: args.lat,
        lng: args.lng,
        timestamp: new Date().toISOString(),
      });
    }
  },
});

// ─── Clock Out ───────────────────────────────────────────────────────────────

export const clockOut = mutation({
  args: {
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);

    const openEntry = await ctx.db
      .query("timeEntries")
      .withIndex("by_member_clockIn", (q) => q.eq("memberId", member._id))
      .order("desc")
      .first();

    if (!openEntry || openEntry.clockOutAt) {
      throw new ConvexError({ message: "Not clocked in.", code: "CONFLICT" });
    }

    const clockOutAt = new Date().toISOString();
    const clockInTime = new Date(openEntry.clockInAt).getTime();
    const clockOutTime = new Date(clockOutAt).getTime();
    const totalHours = Math.round(((clockOutTime - clockInTime) / 3600000) * 100) / 100;

    await ctx.db.patch(openEntry._id, {
      clockOutAt,
      clockOutLat: args.lat,
      clockOutLng: args.lng,
      totalHours,
      notes: args.notes ?? openEntry.notes,
    });

    // Also record a location ping on clock-out
    if (args.lat !== undefined && args.lng !== undefined) {
      await ctx.db.insert("locationPings", {
        orgId: user.currentOrgId!,
        memberId: member._id,
        lat: args.lat,
        lng: args.lng,
        timestamp: clockOutAt,
      });
    }
  },
});

// ─── Send Location Ping ──────────────────────────────────────────────────────

export const sendLocationPing = mutation({
  args: {
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
    roId: v.optional(v.id("repairOrders")),
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);

    await ctx.db.insert("locationPings", {
      orgId: user.currentOrgId!,
      memberId: member._id,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: new Date().toISOString(),
      roId: args.roId,
    });
  },
});

// ─── Get My Clock Status ─────────────────────────────────────────────────────

export const getMyClockStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member) return null;

    const latestEntry = await ctx.db
      .query("timeEntries")
      .withIndex("by_member_clockIn", (q) => q.eq("memberId", member._id))
      .order("desc")
      .first();

    const isClockedIn = latestEntry ? !latestEntry.clockOutAt : false;

    return {
      isClockedIn,
      currentEntry: isClockedIn ? latestEntry : null,
      memberId: member._id,
    };
  },
});

// ─── Get My Time Entries (last 14 days) ──────────────────────────────────────

export const getMyTimeEntries = query({
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

    // Last 14 days
    const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    return await ctx.db
      .query("timeEntries")
      .withIndex("by_member_clockIn", (q) => q.eq("memberId", member._id).gte("clockInAt", cutoff))
      .order("desc")
      .take(100);
  },
});

// ─── Admin: Get All Time Entries for Org (today or date range) ───────────────

export const getOrgTimeEntries = query({
  args: {
    date: v.optional(v.string()), // "YYYY-MM-DD" — defaults to today
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    // Check permission
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member || !["owner", "admin", "service_writer"].includes(member.role)) return [];

    const targetDate = args.date ?? new Date().toISOString().slice(0, 10);
    const dayStart = targetDate + "T00:00:00.000Z";
    const dayEnd = targetDate + "T23:59:59.999Z";

    // Get all members
    const allMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();

    const activeMembers = allMembers.filter((m) => m.isActive);

    // For each active member, find their time entry for this day
    const results = await Promise.all(
      activeMembers.map(async (m) => {
        const userDoc = await ctx.db.get(m.userId);
        const name = userDoc?.name ?? m.inviteEmail ?? "Unknown";

        // Get entries overlapping this day
        const entries = await ctx.db
          .query("timeEntries")
          .withIndex("by_member_clockIn", (q) =>
            q.eq("memberId", m._id).gte("clockInAt", dayStart).lte("clockInAt", dayEnd)
          )
          .collect();

        // Get latest location ping
        const lastPing = await ctx.db
          .query("locationPings")
          .withIndex("by_member_timestamp", (q) => q.eq("memberId", m._id))
          .order("desc")
          .first();

        const isClockedIn = entries.some((e) => !e.clockOutAt);
        const totalHoursToday = entries.reduce((s, e) => s + (e.totalHours ?? 0), 0);

        return {
          memberId: m._id,
          name,
          role: m.role,
          avatarUrl: userDoc?.avatarUrl,
          isClockedIn,
          entries,
          totalHoursToday: Math.round(totalHoursToday * 100) / 100,
          lastPing: lastPing ? {
            lat: lastPing.lat,
            lng: lastPing.lng,
            accuracy: lastPing.accuracy,
            timestamp: lastPing.timestamp,
          } : null,
        };
      })
    );

    return results;
  },
});
