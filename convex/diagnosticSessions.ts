import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import {
  complaintFromDtcs,
  validateDiagnosticSession,
  type DiagnosticSessionPayload,
} from "../src/lib/diagnosticSession.ts";

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

export const listSessions = query({
  args: {
    vehicleId: v.optional(v.id("vehicles")),
    roId: v.optional(v.id("repairOrders")),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireMember(ctx);
    let rows: Doc<"diagnosticSessions">[];
    if (args.vehicleId) {
      rows = await ctx.db
        .query("diagnosticSessions")
        .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId!))
        .order("desc")
        .take(50);
    } else if (args.roId) {
      rows = await ctx.db
        .query("diagnosticSessions")
        .withIndex("by_ro", (q) => q.eq("roId", args.roId!))
        .order("desc")
        .take(50);
    } else {
      rows = await ctx.db
        .query("diagnosticSessions")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .order("desc")
        .take(50);
    }
    return rows.filter((r) => r.orgId === orgId);
  },
});

export const getSession = query({
  args: { sessionId: v.id("diagnosticSessions") },
  handler: async (ctx, args) => {
    const { orgId } = await requireMember(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.orgId !== orgId) return null;
    const vehicle = await ctx.db.get(session.vehicleId);
    const customer = session.customerId ? await ctx.db.get(session.customerId) : null;
    const ro = session.roId ? await ctx.db.get(session.roId) : null;
    return { ...session, vehicle, customer, ro };
  },
});

export const saveSession = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    customerId: v.optional(v.id("customers")),
    roId: v.optional(v.id("repairOrders")),
    mode: v.union(v.literal("simulator"), v.literal("hardware")),
    adapterType: v.union(
      v.literal("simulator"),
      v.literal("elm327"),
      v.literal("stn"),
      v.literal("j2534"),
    ),
    adapterStatus: v.string(),
    vin: v.optional(v.string()),
    mileage: v.optional(v.number()),
    dtcs: v.array(
      v.object({
        code: v.string(),
        status: v.union(v.literal("confirmed"), v.literal("pending"), v.literal("permanent")),
        description: v.optional(v.string()),
      }),
    ),
    freezeFrame: v.optional(v.any()),
    livePidSamples: v.optional(v.any()),
    readiness: v.optional(v.any()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireMember(ctx);
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || vehicle.orgId !== orgId) {
      throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });
    }
    if (args.roId) {
      const ro = await ctx.db.get(args.roId);
      if (!ro || ro.orgId !== orgId) {
        throw new ConvexError({ message: "Repair order not found", code: "NOT_FOUND" });
      }
    }
    const payload: DiagnosticSessionPayload = {
      mode: args.mode,
      adapterType: args.adapterType,
      vin: args.vin,
      mileage: args.mileage,
      dtcs: args.dtcs,
      freezeFrame: args.freezeFrame,
      livePidSamples: args.livePidSamples,
      readiness: args.readiness,
      notes: args.notes,
    };
    const valid = validateDiagnosticSession(payload);
    const now = new Date().toISOString();
    return await ctx.db.insert("diagnosticSessions", {
      orgId,
      vehicleId: args.vehicleId,
      customerId: args.customerId ?? vehicle.customerId,
      roId: args.roId,
      mode: valid.mode,
      adapterType: valid.adapterType,
      adapterStatus: args.adapterStatus,
      vin: valid.vin ?? vehicle.vin,
      mileage: args.mileage,
      dtcs: valid.dtcs,
      freezeFrame: valid.freezeFrame,
      livePidSamples: valid.livePidSamples,
      readiness: valid.readiness,
      notes: args.notes,
      createdBy: user._id,
      scannedAt: now,
    });
  },
});

export const confirmClearCodes = mutation({
  args: { sessionId: v.id("diagnosticSessions") },
  handler: async (ctx, args) => {
    const { member, orgId } = await requireMember(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.orgId !== orgId) {
      throw new ConvexError({ message: "Session not found", code: "NOT_FOUND" });
    }
    if (session.clearedAt) {
      throw new ConvexError({ message: "Codes already cleared on this session", code: "CONFLICT" });
    }
    await ctx.db.patch(args.sessionId, {
      dtcs: [],
      freezeFrame: undefined,
      clearedAt: new Date().toISOString(),
      clearConfirmedBy: member._id,
    });
  },
});

export const createEstimateFromSession = mutation({
  args: { sessionId: v.id("diagnosticSessions") },
  handler: async (ctx, args) => {
    const { orgId } = await requireMember(ctx);
    const session = await ctx.db.get(args.sessionId);
    if (!session || session.orgId !== orgId) {
      throw new ConvexError({ message: "Session not found", code: "NOT_FOUND" });
    }
    const vehicle = await ctx.db.get(session.vehicleId);
    if (!vehicle) throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });
    const customerId = session.customerId ?? vehicle.customerId;

    const last = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .first();
    let roNumber = "RO-0001";
    if (last) {
      const match = last.roNumber.match(/\d+$/);
      const num = match ? parseInt(match[0], 10) + 1 : 1;
      roNumber = `RO-${String(num).padStart(4, "0")}`;
    }

    const roId = await ctx.db.insert("repairOrders", {
      orgId,
      roNumber,
      customerId,
      vehicleId: session.vehicleId,
      isMobile: false,
      complaint: complaintFromDtcs(session.dtcs),
      cause: session.dtcs.map((d) => `${d.code}${d.description ? ` — ${d.description}` : ""}`).join("; ") || undefined,
      priority: "normal",
      status: "estimate",
      mileageIn: session.mileage,
      laborLines: [],
      partLines: [],
      shopFees: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      aiWorkflowStatus: "pending",
    });

    await ctx.db.patch(args.sessionId, { roId });
    return roId;
  },
});
