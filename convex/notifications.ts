import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Returns badge counts for sidebar navigation items.
 * Only items that need attention (actionable counts > 0) are returned.
 */
export const getBadgeCounts = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args): Promise<{
    pendingBookings: number;
    overdueInvoices: number;
    overdueJobs: number;
    waitingParts: number;
    lowStockParts: number;
    newEstimates: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { pendingBookings: 0, overdueInvoices: 0, overdueJobs: 0, waitingParts: 0, lowStockParts: 0, newEstimates: 0 };
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) {
      return { pendingBookings: 0, overdueInvoices: 0, overdueJobs: 0, waitingParts: 0, lowStockParts: 0, newEstimates: 0 };
    }
    const orgId = user.currentOrgId;
    const now = new Date().toISOString();

    // Run all queries in parallel for speed
    const [
      pendingBookingsData,
      sentInvoices,
      partialInvoices,
      estimateROs,
      approvedROs,
      inProgressROs,
      waitingPartsROs,
      allParts,
    ] = await Promise.all([
      ctx.db.query("bookingRequests").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "pending")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "sent")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "partial")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "estimate")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "approved")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "in_progress")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "waiting_parts")).collect(),
      ctx.db.query("parts").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(1000),
    ]);

    // Pending bookings count
    const pendingBookings = pendingBookingsData.length;

    // Overdue invoices: sent or partial with dueAt before now
    const overdueInvoices = [...sentInvoices, ...partialInvoices].filter(
      (inv) => inv.dueAt && inv.dueAt < now
    ).length;

    // Overdue jobs: active ROs with promisedAt before now
    const allActive = [...estimateROs, ...approvedROs, ...inProgressROs, ...waitingPartsROs];
    const filteredActive = args.locationId
      ? allActive.filter((ro) => ro.locationId === args.locationId)
      : allActive;
    const overdueJobs = filteredActive.filter(
      (ro) => ro.promisedAt && ro.promisedAt < now
    ).length;

    // Waiting parts count (location-filtered)
    const waitingParts = args.locationId
      ? waitingPartsROs.filter((ro) => ro.locationId === args.locationId).length
      : waitingPartsROs.length;

    // Low stock parts
    const lowStockParts = allParts.filter(
      (p) => p.stockQty <= p.lowStockThreshold
    ).length;

    // New estimates needing review
    const newEstimates = args.locationId
      ? estimateROs.filter((ro) => ro.locationId === args.locationId).length
      : estimateROs.length;

    return {
      pendingBookings,
      overdueInvoices,
      overdueJobs,
      waitingParts,
      lowStockParts,
      newEstimates,
    };
  },
});
