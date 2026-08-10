import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getIdentityBySecret = internalQuery({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("pushIdentities")
      .withIndex("by_secret", (q) => q.eq("secret", args.secret))
      .first();
  },
});

export const listByVisitorIds = internalQuery({
  args: { visitorIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const out = [];
    for (const visitorId of args.visitorIds) {
      const rows = await ctx.db
        .query("pushIdentities")
        .withIndex("by_visitorId", (q) => q.eq("visitorId", visitorId))
        .collect();
      out.push(...rows);
    }
    return out;
  },
});

export const storeIdentity = internalMutation({
  args: {
    secret: v.string(),
    visitorId: v.string(),
    subscription: v.optional(
      v.object({
        endpoint: v.string(),
        keys: v.object({ p256dh: v.string(), auth: v.string() }),
        expirationTime: v.optional(v.union(v.number(), v.null())),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("pushIdentities", {
      secret: args.secret,
      visitorId: args.visitorId,
      ...(args.subscription ? { subscription: args.subscription } : {}),
    });
  },
});

export const updateIdentityVisitorId = internalMutation({
  args: { secret: v.string(), visitorId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.db
      .query("pushIdentities")
      .withIndex("by_secret", (q) => q.eq("secret", args.secret))
      .first();
    if (identity) {
      await ctx.db.patch(identity._id, { visitorId: args.visitorId });
    }
  },
});

export const deleteIdentity = internalMutation({
  args: { secret: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.db
      .query("pushIdentities")
      .withIndex("by_secret", (q) => q.eq("secret", args.secret))
      .first();
    if (identity) {
      await ctx.db.delete(identity._id);
    }
  },
});
