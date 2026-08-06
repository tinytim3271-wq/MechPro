import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";

function generateApprovalToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function verifyApprovalToken(
  ro: Doc<"repairOrders">,
  token: string | undefined,
): boolean {
  return !!ro.approvalToken && !!token && ro.approvalToken === token;
}

async function getAuthedOrgMember(ctx: QueryCtx | MutationCtx, roId: Id<"repairOrders">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) {
    throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
  }

  const ro = await ctx.db.get(roId);
  if (!ro || ro.orgId !== user.currentOrgId) {
    throw new ConvexError({ message: "Repair order not found", code: "NOT_FOUND" });
  }

  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member?.isActive) {
    throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  }

  return { user, ro, member };
}

// ─── Staff: create or return approval token for shareable estimate link ───────

export const ensureApprovalToken = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ token: string }> => {
    const { ro } = await getAuthedOrgMember(ctx, args.roId);

    if (ro.approvalToken) {
      return { token: ro.approvalToken };
    }

    const token = generateApprovalToken();
    await ctx.db.patch(args.roId, { approvalToken: token });
    return { token };
  },
});

// ─── Public Estimate Query (token required) ───────────────────────────────────
// Used by the shareable /approve?ro=...&token=... page

export const getEstimatePublic = query({
  args: {
    roId: v.id("repairOrders"),
    token: v.string(),
  },
  handler: async (ctx, args): Promise<{
    _id: Doc<"repairOrders">["_id"];
    roNumber: string;
    status: string;
    complaint: string;
    cause: string | undefined;
    vehicleSummary: string;
    customerName: string;
    laborLines: Doc<"repairOrders">["laborLines"];
    partLines: Doc<"repairOrders">["partLines"];
    shopFees: Doc<"repairOrders">["shopFees"];
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    orgName: string;
    orgPhone: string | undefined;
    orgLogoUrl: string | undefined;
    approvedAt: string | null;
    authorizationName: string | undefined;
  } | null> => {
    const ro = await ctx.db.get(args.roId);
    if (!ro || !verifyApprovalToken(ro, args.token)) return null;

    const org = await ctx.db.get(ro.orgId);
    const customer = await ctx.db.get(ro.customerId);
    const vehicle = await ctx.db.get(ro.vehicleId);

    return {
      _id: ro._id,
      roNumber: ro.roNumber,
      status: ro.status,
      complaint: ro.complaint,
      cause: ro.cause,
      vehicleSummary: vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : "Unknown Vehicle",
      customerName: customer?.name ?? "Customer",
      laborLines: ro.laborLines,
      partLines: ro.partLines,
      shopFees: ro.shopFees,
      subtotal: ro.subtotal,
      taxAmount: ro.taxAmount,
      totalAmount: ro.totalAmount,
      orgName: org?.name ?? "Shop",
      orgPhone: org?.phone,
      orgLogoUrl: org?.logoUrl,
      approvedAt: ro.signedAt ?? null,
      authorizationName: ro.authorizationName,
    };
  },
});

// ─── Recently Signed Estimates (for office notification) ──────────────────────

export const getRecentlySignedEstimate = query({
  args: {},
  handler: async (ctx): Promise<{ roNumber: string; customerName: string; signedAt: string; totalAmount: number } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    const approvedROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org_status", (q) => q.eq("orgId", user.currentOrgId!).eq("status", "approved"))
      .order("desc")
      .take(1);

    const ro = approvedROs[0];
    if (!ro || !ro.signedAt) return null;

    const customer = await ctx.db.get(ro.customerId);

    return {
      roNumber: ro.roNumber,
      customerName: customer?.name ?? ro.authorizationName ?? "Customer",
      signedAt: ro.signedAt,
      totalAmount: ro.totalAmount,
    };
  },
});

// ─── Public Approve Estimate Mutation (token required) ───────────────────────

export const approveEstimate = mutation({
  args: {
    roId: v.id("repairOrders"),
    token: v.string(),
    customerName: v.string(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const ro = await ctx.db.get(args.roId);
    if (!ro || !verifyApprovalToken(ro, args.token)) {
      throw new ConvexError({ message: "Repair order not found", code: "NOT_FOUND" });
    }

    if (ro.status !== "estimate") {
      throw new ConvexError({
        message: "This estimate has already been approved or is no longer available",
        code: "CONFLICT",
      });
    }

    const now = new Date().toISOString();

    await ctx.db.patch(args.roId, {
      status: "approved",
      authorizationName: args.customerName,
      authorizationMethod: "online_approval",
      signedAt: now,
    });

    return { success: true };
  },
});
