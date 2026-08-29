import { query } from "./_generated/server";

/** Lightweight readiness probe — verifies the runtime and DB are reachable. */
export const ping = query({
  args: {},
  handler: async (ctx) => {
    await ctx.db.query("organizations").take(1);
    return { ok: true };
  },
});
