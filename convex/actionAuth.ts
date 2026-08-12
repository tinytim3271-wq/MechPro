import { ConvexError } from "convex/values";
import type { ActionCtx } from "./_generated/server.d.ts";

/** Require authentication for public Convex actions. */
export async function requireAuthenticatedAction(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }
  return identity;
}
