import { v, ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";

const MAX_DEVICES = 3;

// Check if user is an owner of any org — owners are exempt from device limits
async function isOwner(ctx: MutationCtx | QueryCtx, userId: Id<"users">): Promise<boolean> {
  const memberships = await ctx.db
    .query("orgMembers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return memberships.some((m) => m.role === "owner" && m.isActive);
}

// ─── Register a device session (called on app load) ────────────────────────────
// Allows up to MAX_DEVICES per user. Owners are unlimited.

export const registerDevice = mutation({
  args: {
    sessionToken: v.string(),
    deviceName: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const now = new Date().toISOString();

    // Check if this session is already registered
    const existing = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user_token", (q) =>
        q.eq("userId", user._id).eq("sessionToken", args.sessionToken)
      )
      .unique();

    if (existing) {
      // Update last active timestamp
      await ctx.db.patch(existing._id, { lastActiveAt: now });
      return { success: true, blocked: false, reason: "already_registered" };
    }

    // Count existing sessions for this user
    const sessions = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    // Owners are exempt from limits
    const ownerExempt = await isOwner(ctx, user._id);

    if (!ownerExempt && sessions.length >= MAX_DEVICES) {
      return { success: false, blocked: true, reason: "max_devices_reached" };
    }

    // Register new device
    await ctx.db.insert("deviceSessions", {
      userId: user._id,
      sessionToken: args.sessionToken,
      deviceName: args.deviceName,
      registeredAt: now,
      lastActiveAt: now,
    });

    return { success: true, blocked: false, reason: "registered" };
  },
});

// ─── Check if this device session is still valid ──────────────────────────────
// Returns whether this session token is registered for the current user.

export const checkDeviceSession = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { isActive: false, reason: "unauthenticated" };

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return { isActive: false, reason: "user_not_found" };

    // Owners always pass
    if (await isOwner(ctx, user._id)) {
      return { isActive: true, reason: "owner_exempt" };
    }

    // Check if this session exists
    const session = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user_token", (q) =>
        q.eq("userId", user._id).eq("sessionToken", args.sessionToken)
      )
      .unique();

    if (session) {
      return { isActive: true, reason: "current_device" };
    }

    return { isActive: false, reason: "device_not_registered" };
  },
});

// ─── List all devices for the current user ────────────────────────────────────

export const listMyDevices = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) return [];

    const sessions = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return sessions.map((s) => ({
      _id: s._id,
      deviceName: s.deviceName,
      registeredAt: s.registeredAt,
      lastActiveAt: s.lastActiveAt,
      sessionToken: s.sessionToken,
    }));
  },
});

// ─── Remove a specific device session ─────────────────────────────────────────

export const removeDevice = mutation({
  args: { deviceId: v.id("deviceSessions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const session = await ctx.db.get(args.deviceId);
    if (!session || session.userId !== user._id) {
      throw new ConvexError({ message: "Device not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.deviceId);
    return { success: true };
  },
});

// ─── Release all device sessions (clear all devices) ──────────────────────────

export const releaseDeviceLock = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    // Delete all sessions for this user
    const sessions = await ctx.db
      .query("deviceSessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    return { success: true };
  },
});
