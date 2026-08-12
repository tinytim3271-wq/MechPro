import { query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";

export const getDashboardStats = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    // Use status-indexed queries instead of scanning everything
    const [
      inProgressROs,
      estimateROs,
      completedROs,
      waitingPartsROs,
      approvedROs,
      activeMembers,
    ] = await Promise.all([
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "in_progress")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "estimate")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "completed")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "waiting_parts")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "approved")).collect(),
      ctx.db.query("orgMembers").withIndex("by_org", (q) => q.eq("orgId", orgId)).filter((q) => q.eq(q.field("isActive"), true)).collect(),
    ]);

    // Apply location filter if provided
    const locFilter = (ro: { locationId?: Id<"locations"> }) =>
      !args.locationId || ro.locationId === args.locationId;

    const filteredInProgress = inProgressROs.filter(locFilter);
    const filteredEstimate = estimateROs.filter(locFilter);
    const filteredCompleted = completedROs.filter(locFilter);
    const filteredWaitingParts = waitingPartsROs.filter(locFilter);
    const filteredApproved = approvedROs.filter(locFilter);

    // Today's ROs: only scan in-progress + approved + estimate for scheduledAt (bounded sets)
    const allActiveROs = [...filteredInProgress, ...filteredEstimate, ...filteredApproved, ...filteredWaitingParts];
    const todayROsCount = allActiveROs.filter(
      (r) => r.scheduledAt && r.scheduledAt >= todayStart && r.scheduledAt < todayEnd
    ).length;

    // Revenue: only scan paid/partial invoices using the status index
    const [paidInvoices, partialInvoices, unpaidInvoices, draftInvoices] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "paid")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "partial")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "sent")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "draft")).collect(),
    ]);

    const paidRevenue = [...paidInvoices, ...partialInvoices].reduce((sum, i) => sum + i.amountPaid, 0);
    const outstanding = [...unpaidInvoices, ...draftInvoices, ...partialInvoices].reduce(
      (sum, i) => sum + (i.total - i.amountPaid),
      0
    );

    // Customer count: bounded sample (use take to avoid scanning massive tables)
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(5000);

    const org = await ctx.db.get(orgId);

    return {
      orgId,
      orgName: org?.name ?? "My Shop",
      bayCount: org?.bayCount ?? 0,
      todayROsCount,
      inProgressCount: filteredInProgress.length,
      estimateCount: filteredEstimate.length,
      completedCount: filteredCompleted.length,
      waitingPartsCount: filteredWaitingParts.length,
      paidRevenue,
      outstanding,
      activeStaff: activeMembers.length,
      totalCustomers: customers.length,
    };
  },
});

export const getRecentROs = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(50);

    // Filter by location then take top 10
    const filtered = args.locationId
      ? ros.filter((ro) => ro.locationId === args.locationId).slice(0, 10)
      : ros.slice(0, 10);

    return await Promise.all(
      filtered.map(async (ro) => {
        const customer = await ctx.db.get(ro.customerId);
        const vehicle = await ctx.db.get(ro.vehicleId);
        return {
          ...ro,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
        };
      })
    );
  },
});

export const getActionAlerts = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    const now = new Date().toISOString();

    // Overdue invoices: sent or partial with dueAt before now
    const [sentInvoices, partialInvoices] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "sent")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "partial")).collect(),
    ]);
    const overdueInvoices = [...sentInvoices, ...partialInvoices].filter(
      (inv) => inv.dueAt && inv.dueAt < now
    ).length;

    // Low stock parts — bounded fetch
    const allParts = await ctx.db
      .query("parts")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(1000);
    const lowStockParts = allParts.filter(
      (p) => p.stockQty <= p.lowStockThreshold
    ).length;

    // Overdue jobs: active statuses with promisedAt before now
    const [estimateROs, approvedROs, inProgressROs, waitingPartsROs] = await Promise.all([
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "estimate")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "approved")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "in_progress")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "waiting_parts")).collect(),
    ]);

    // Apply location filter if present
    const allActive = [...estimateROs, ...approvedROs, ...inProgressROs, ...waitingPartsROs];
    const filteredActive = args.locationId
      ? allActive.filter((ro) => ro.locationId === args.locationId)
      : allActive;
    const overdueJobs = filteredActive.filter(
      (ro) => ro.promisedAt && ro.promisedAt < now
    ).length;

    return { overdueInvoices, lowStockParts, overdueJobs };
  },
});

export const globalSearch = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    if (args.q.length < 2) return null;

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    const searchLower = args.q.toLowerCase();

    // Search customers by name — take a smaller bounded set
    const allCustomers = await ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(200);

    const matchedCustomers = allCustomers
      .filter((c) => c.name.toLowerCase().includes(searchLower))
      .slice(0, 5)
      .map((c) => ({ _id: c._id, name: c.name, phone: c.phone ?? "" }));

    // Search repair orders by roNumber or complaint — only recent 200
    const allROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(200);

    const matchedROsRaw = allROs
      .filter(
        (ro) =>
          ro.roNumber.toLowerCase().includes(searchLower) ||
          ro.complaint.toLowerCase().includes(searchLower)
      )
      .slice(0, 5);

    const matchedROs = await Promise.all(
      matchedROsRaw.map(async (ro) => {
        const customer = await ctx.db.get(ro.customerId);
        return {
          _id: ro._id,
          roNumber: ro.roNumber,
          customerName: customer?.name ?? "Unknown",
          status: ro.status,
        };
      })
    );

    // Search invoices by invoiceNumber — only recent 200
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(200);

    const matchedInvoicesRaw = allInvoices
      .filter((inv) => inv.invoiceNumber.toLowerCase().includes(searchLower))
      .slice(0, 5);

    const matchedInvoices = await Promise.all(
      matchedInvoicesRaw.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        return {
          _id: inv._id,
          invoiceNumber: inv.invoiceNumber,
          customerName: customer?.name ?? "Unknown",
          total: inv.total,
          status: inv.status,
        };
      })
    );

    return {
      customers: matchedCustomers,
      ros: matchedROs,
      invoices: matchedInvoices,
    };
  },
});

export const getBayBoard = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    // If a location is selected, use that location's bayNames; otherwise use the org's
    let bayNames: string[];
    if (args.locationId) {
      const location = await ctx.db.get(args.locationId);
      if (!location || location.orgId !== user.currentOrgId) return null;
      bayNames = location.bayNames;
    } else {
      const org = await ctx.db.get(user.currentOrgId);
      if (!org) return null;
      bayNames = org.bayNames;
    }

    const [activeROs, approvedROs] = await Promise.all([
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", user.currentOrgId!).eq("status", "in_progress")).collect(),
      ctx.db.query("repairOrders").withIndex("by_org_status", (q) => q.eq("orgId", user.currentOrgId!).eq("status", "approved")).collect(),
    ]);

    let allBayROs = [...activeROs, ...approvedROs].filter((r) => !r.isMobile && r.bayName);

    // Filter by location if selected
    if (args.locationId) {
      allBayROs = allBayROs.filter((r) => r.locationId === args.locationId);
    }

    const bayMap = new Map<string, typeof allBayROs[0] | undefined>();
    bayNames.forEach((b) => bayMap.set(b, undefined));
    allBayROs.forEach((ro) => {
      if (ro.bayName && bayMap.has(ro.bayName)) {
        bayMap.set(ro.bayName, ro);
      }
    });

    return {
      bayNames,
      bayMap: Object.fromEntries(bayMap),
    };
  },
});

// Revenue comparison: current month vs last month and same month last year
export const getRevenueComparison = query({
  args: { locationId: v.optional(v.id("locations")) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // Define period boundaries (ISO strings)
    const currentMonthStart = new Date(currentYear, currentMonth, 1).toISOString();
    const currentMonthEnd = new Date(currentYear, currentMonth + 1, 1).toISOString();

    const lastMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString();
    const lastMonthEnd = new Date(currentYear, currentMonth, 1).toISOString();

    const sameMonthLastYearStart = new Date(currentYear - 1, currentMonth, 1).toISOString();
    const sameMonthLastYearEnd = new Date(currentYear - 1, currentMonth + 1, 1).toISOString();

    // Fetch all paid/partial invoices for the org
    const [paidInvoices, partialInvoices] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "paid")).collect(),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "partial")).collect(),
    ]);

    const allPaidInvoices = [...paidInvoices, ...partialInvoices];

    // Apply location filter if given
    const filtered = args.locationId
      ? allPaidInvoices.filter((inv) => inv.locationId === args.locationId)
      : allPaidInvoices;

    // Calculate revenue per period based on issuedAt
    const sumRevenue = (invoices: typeof filtered, start: string, end: string) =>
      invoices
        .filter((inv) => inv.issuedAt >= start && inv.issuedAt < end)
        .reduce((sum, inv) => sum + inv.amountPaid, 0);

    const currentMonthRevenue = sumRevenue(filtered, currentMonthStart, currentMonthEnd);
    const lastMonthRevenue = sumRevenue(filtered, lastMonthStart, lastMonthEnd);
    const sameMonthLastYearRevenue = sumRevenue(filtered, sameMonthLastYearStart, sameMonthLastYearEnd);

    // Percentage change helpers
    const pctChange = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100);
    };

    // Daily revenue trend for last 12 months
    const trendData: { month: string; revenue: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const mStart = new Date(currentYear, currentMonth - i, 1);
      const mEnd = new Date(currentYear, currentMonth - i + 1, 1);
      const monthRevenue = sumRevenue(filtered, mStart.toISOString(), mEnd.toISOString());
      const label = mStart.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      trendData.push({ month: label, revenue: Math.round(monthRevenue * 100) / 100 });
    }

    return {
      currentMonth: {
        label: now.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        revenue: Math.round(currentMonthRevenue * 100) / 100,
      },
      lastMonth: {
        label: new Date(currentYear, currentMonth - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        revenue: Math.round(lastMonthRevenue * 100) / 100,
        changePercent: pctChange(currentMonthRevenue, lastMonthRevenue),
      },
      sameMonthLastYear: {
        label: new Date(currentYear - 1, currentMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        revenue: Math.round(sameMonthLastYearRevenue * 100) / 100,
        changePercent: pctChange(currentMonthRevenue, sameMonthLastYearRevenue),
      },
      trend: trendData,
    };
  },
});

// ─── Setup Checklist Status ─────────────────────────────────────────────────
// Returns completion status for each onboarding step. Only disappears when all are done.
export const getSetupChecklist = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    const org = await ctx.db.get(orgId);
    if (!org) return null;

    // 1. Shop info configured: has phone, address, and labor rate > 0
    const shopInfoComplete = !!(
      org.phone &&
      org.address &&
      org.laborRate > 0
    );

    // 2. Invite team: at least one other active member besides the owner
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const activeNonOwner = members.filter(
      (m) => m.isActive && m.role !== "owner"
    );
    const teamInvited = activeNonOwner.length > 0;

    // 3. First intake: at least one repair order exists
    const firstRO = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    const firstIntakeComplete = !!firstRO;

    // 4. Messaging setup: smsEnabled is true (templates configured)
    const smsSetup = !!(org.smsEnabled);

    // 5. Booking link shared: we consider this complete if booking requests exist
    //    (meaning the link was shared and someone used it) — or if the org has been open 7+ days
    const firstBooking = await ctx.db
      .query("bookingRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .first();
    const orgAgeMs = Date.now() - org._creationTime;
    const bookingLinkShared = !!firstBooking || orgAgeMs > 7 * 24 * 60 * 60 * 1000;

    return {
      shopInfoComplete,
      teamInvited,
      firstIntakeComplete,
      smsSetup,
      bookingLinkShared,
    };
  },
});
