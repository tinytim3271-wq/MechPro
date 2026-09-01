import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { assertKeyJobAuthorized, KeyAuthorizationError } from "../src/lib/keyProgramming.ts";

async function requireMember(ctx: QueryCtx | MutationCtx) {
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
  if (!member || !member.isActive) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  return { user, member, orgId: user.currentOrgId as Id<"organizations"> };
}

function wrapAuth(err: unknown): never {
  if (err instanceof KeyAuthorizationError) {
    throw new ConvexError({ message: err.message, code: err.code });
  }
  throw err;
}

export const listJobs = query({
  args: {
    vehicleId: v.optional(v.id("vehicles")),
    roId: v.optional(v.id("repairOrders")),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireMember(ctx);
    const rows = args.vehicleId
      ? await ctx.db
          .query("keyProgrammingJobs")
          .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId!))
          .order("desc")
          .take(50)
      : args.roId
        ? await ctx.db
            .query("keyProgrammingJobs")
            .withIndex("by_ro", (q) => q.eq("roId", args.roId!))
            .order("desc")
            .take(50)
        : await ctx.db
            .query("keyProgrammingJobs")
            .withIndex("by_org", (q) => q.eq("orgId", orgId))
            .order("desc")
            .take(50);
    return rows.filter((r) => r.orgId === orgId);
  },
});

export const createJob = mutation({
  args: {
    customerId: v.id("customers"),
    vehicleId: v.id("vehicles"),
    roId: v.id("repairOrders"),
    keyType: v.union(
      v.literal("transponder"),
      v.literal("proximity"),
      v.literal("mechanical"),
      v.literal("smart_key"),
    ),
    operation: v.string(),
    mode: v.union(v.literal("simulator"), v.literal("hardware")),
    adapterStatus: v.string(),
    resultNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireMember(ctx);
    const customer = await ctx.db.get(args.customerId);
    const vehicle = await ctx.db.get(args.vehicleId);
    const ro = await ctx.db.get(args.roId);
    if (!customer || customer.orgId !== orgId) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }
    if (!vehicle || vehicle.orgId !== orgId) {
      throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });
    }
    if (!ro || ro.orgId !== orgId) {
      throw new ConvexError({ message: "Repair order not found", code: "NOT_FOUND" });
    }

    let auth;
    try {
      auth = assertKeyJobAuthorized({
        customerId: args.customerId,
        vehicleId: args.vehicleId,
        ro: {
          _id: ro._id,
          customerId: ro.customerId,
          vehicleId: ro.vehicleId,
          authorizationName: ro.authorizationName,
          authorizationMethod: ro.authorizationMethod,
          signedAt: ro.signedAt,
          customerSignature: ro.customerSignature,
          status: ro.status,
        },
        operation: args.operation,
      });
    } catch (err) {
      wrapAuth(err);
    }
    if (!auth) {
      throw new ConvexError({ message: "Authorization failed", code: "UNAUTHORIZED" });
    }

    const now = new Date().toISOString();
    return await ctx.db.insert("keyProgrammingJobs", {
      orgId,
      customerId: args.customerId,
      vehicleId: args.vehicleId,
      roId: args.roId,
      authorizationName: auth.authorizationName,
      authorizationMethod: ro.authorizationMethod,
      signedAt: auth.signedAt,
      keyType: args.keyType,
      operation: auth.operation,
      mode: args.mode,
      adapterStatus: args.adapterStatus,
      result: "success",
      resultNotes: args.resultNotes,
      programmedAt: now,
      createdBy: user._id,
    });
  },
});
