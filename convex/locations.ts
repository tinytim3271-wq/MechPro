import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getAuthedMember(ctx: MutationCtx | QueryCtx): Promise<{
  user: Doc<"users">;
  member: Doc<"orgMembers">;
  orgId: Id<"organizations">;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) throw new ConvexError({ message: "No organization", code: "FORBIDDEN" });
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  return { user, member, orgId: user.currentOrgId };
}

function requireAdmin(member: Doc<"orgMembers">) {
  if (member.role !== "owner" && member.role !== "admin") {
    throw new ConvexError({ message: "Admin access required", code: "FORBIDDEN" });
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listLocations = query({
  args: {},
  handler: async (ctx): Promise<Array<Doc<"locations">>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    return await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect()
      .then((locs) => locs.sort((a, b) => a.sortOrder - b.sortOrder));
  },
});

export const getActiveLocation = query({
  args: {},
  handler: async (ctx): Promise<Doc<"locations"> | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentLocationId) return null;
    return await ctx.db.get(user.currentLocationId);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createLocation = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    phone: v.optional(v.string()),
    bayCount: v.number(),
  },
  handler: async (ctx, args): Promise<Id<"locations">> => {
    const { member, orgId } = await getAuthedMember(ctx);
    requireAdmin(member);

    // Determine sort order
    const existing = await ctx.db
      .query("locations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const maxOrder = existing.reduce((m, l) => Math.max(m, l.sortOrder), -1);
    const bayNames = Array.from({ length: args.bayCount }, (_, i) => `Bay ${i + 1}`);

    return await ctx.db.insert("locations", {
      orgId,
      name: args.name,
      address: args.address,
      city: args.city,
      state: args.state,
      zip: args.zip,
      phone: args.phone,
      bayCount: args.bayCount,
      bayNames,
      isActive: true,
      sortOrder: maxOrder + 1,
    });
  },
});

export const updateLocation = mutation({
  args: {
    locationId: v.id("locations"),
    name: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    phone: v.optional(v.string()),
    bayCount: v.optional(v.number()),
    bayNames: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<void> => {
    const { member, orgId } = await getAuthedMember(ctx);
    requireAdmin(member);
    const location = await ctx.db.get(args.locationId);
    if (!location || location.orgId !== orgId) {
      throw new ConvexError({ message: "Location not found", code: "NOT_FOUND" });
    }
    const { locationId, bayCount, ...rest } = args;
    const updates: Partial<Doc<"locations">> = { ...rest };
    if (bayCount !== undefined) {
      updates.bayCount = bayCount;
      if (args.bayNames === undefined) {
        updates.bayNames = Array.from({ length: bayCount }, (_, i) => `Bay ${i + 1}`);
      }
    }
    await ctx.db.patch(locationId, updates);
  },
});

export const deleteLocation = mutation({
  args: { locationId: v.id("locations") },
  handler: async (ctx, args): Promise<void> => {
    const { member, orgId } = await getAuthedMember(ctx);
    requireAdmin(member);
    const location = await ctx.db.get(args.locationId);
    if (!location || location.orgId !== orgId) {
      throw new ConvexError({ message: "Location not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.locationId);
  },
});

export const switchLocation = mutation({
  args: { locationId: v.union(v.id("locations"), v.null()) },
  handler: async (ctx, args): Promise<void> => {
    const { user, orgId } = await getAuthedMember(ctx);
    if (args.locationId !== null) {
      const location = await ctx.db.get(args.locationId);
      if (!location || location.orgId !== orgId) {
        throw new ConvexError({ message: "Location not found", code: "NOT_FOUND" });
      }
    }
    await ctx.db.patch(user._id, { currentLocationId: args.locationId ?? undefined });
  },
});
