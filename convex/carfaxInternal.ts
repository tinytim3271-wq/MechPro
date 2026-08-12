import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Internal mutation to mark an RO as reported to Carfax.
 * Must be in a separate file from the Node action.
 */
export const markReported = internalMutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roId, {
      carfaxReportedAt: new Date().toISOString(),
    });
  },
});
