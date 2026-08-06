import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAdminMember(ctx: QueryCtx): Promise<{
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
  if (!["owner", "admin", "service_writer"].includes(member.role) && !member.hasAdminAccess) {
    throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
  }
  return { user, member, orgId: user.currentOrgId };
}

// ─── Technician Performance Report ───────────────────────────────────────────

export const getTechPerformance = query({
  args: {
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(),   // "YYYY-MM-DD"
  },
  handler: async (ctx, args): Promise<Array<{
    memberId: Id<"orgMembers">;
    techName: string;
    role: string;
    employmentType: string;
    jobsCompleted: number;
    totalHoursBilled: number;
    avgHoursPerJob: number;
    totalRevenue: number;
    avgRevenuePerJob: number;
    comebackRate: number;
    comebackCount: number;
  }>> => {
    const { orgId } = await getAdminMember(ctx);

    const startISO = args.startDate + "T00:00:00.000Z";
    const endISO = args.endDate + "T23:59:59.999Z";

    // Get all tech members (mechanics and mobile mechanics)
    const allMembers = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const techMembers = allMembers.filter(
      (m) => m.role === "mechanic" || m.role === "mobile_mechanic"
    );

    if (techMembers.length === 0) return [];

    // Get completed/invoiced ROs in date range (using completedAt)
    const allROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const completedROsInRange = allROs.filter((ro) => {
      if (ro.status !== "completed" && ro.status !== "invoiced") return false;
      const completedDate = ro.completedAt ?? new Date(ro._creationTime).toISOString();
      return completedDate >= startISO && completedDate <= endISO;
    });

    // Get pay records in date range for hours/revenue data
    const payRecords = await ctx.db
      .query("techPayRecords")
      .withIndex("by_org_paidAt", (q) =>
        q.eq("orgId", orgId).gte("paidAt", startISO).lte("paidAt", endISO)
      )
      .collect();

    // Detect comebacks: same vehicle returning within 30 days for a related issue
    // We look for vehicles that have 2+ completed ROs in the date range
    const vehicleROMap = new Map<string, typeof completedROsInRange>();
    for (const ro of allROs) {
      if (ro.status !== "completed" && ro.status !== "invoiced") continue;
      const key = ro.vehicleId as string;
      const existing = vehicleROMap.get(key);
      if (existing) {
        existing.push(ro);
      } else {
        vehicleROMap.set(key, [ro]);
      }
    }

    // A comeback is when the same vehicle returns within 30 days
    const comebackROIds = new Set<string>();
    for (const [, ros] of vehicleROMap) {
      if (ros.length < 2) continue;
      const sorted = ros.sort((a, b) => {
        const aDate = a.completedAt ?? new Date(a._creationTime).toISOString();
        const bDate = b.completedAt ?? new Date(b._creationTime).toISOString();
        return aDate.localeCompare(bDate);
      });
      for (let i = 1; i < sorted.length; i++) {
        const prevDate = new Date(sorted[i - 1].completedAt ?? sorted[i - 1]._creationTime);
        const currDate = new Date(sorted[i].completedAt ?? sorted[i]._creationTime);
        const daysDiff = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysDiff <= 30) {
          // The previous RO's tech gets the comeback
          comebackROIds.add(sorted[i - 1]._id as string);
        }
      }
    }

    // Build per-tech performance stats
    const results = await Promise.all(
      techMembers.map(async (member) => {
        const userDoc = await ctx.db.get(member.userId);
        const techName = userDoc?.name ?? member.inviteEmail ?? "Unknown";

        // Jobs completed by this tech in range
        const techROs = completedROsInRange.filter(
          (ro) => ro.assignedTo === member._id
        );
        const jobsCompleted = techROs.length;

        // Pay records for this tech in range
        const techPayRecords = payRecords.filter((r) => r.memberId === member._id);
        const totalHoursBilled = techPayRecords.reduce((s, r) => s + r.totalHours, 0);
        const totalRevenue = techPayRecords.reduce((s, r) => s + r.totalEarned, 0);

        // Comebacks: ROs that were assigned to this tech that resulted in a comeback
        const comebackCount = techROs.filter(
          (ro) => comebackROIds.has(ro._id as string)
        ).length;
        const comebackRate = jobsCompleted > 0 ? comebackCount / jobsCompleted : 0;

        return {
          memberId: member._id,
          techName,
          role: member.role,
          employmentType: member.employmentType ?? "w2",
          jobsCompleted,
          totalHoursBilled: Math.round(totalHoursBilled * 100) / 100,
          avgHoursPerJob: jobsCompleted > 0
            ? Math.round((totalHoursBilled / jobsCompleted) * 100) / 100
            : 0,
          totalRevenue: Math.round(totalRevenue * 100) / 100,
          avgRevenuePerJob: jobsCompleted > 0
            ? Math.round((totalRevenue / jobsCompleted) * 100) / 100
            : 0,
          comebackRate: Math.round(comebackRate * 1000) / 10, // percentage with 1 decimal
          comebackCount,
        };
      })
    );

    // Sort by total revenue descending
    return results.sort((a, b) => b.totalRevenue - a.totalRevenue);
  },
});

// ─── Parts Profitability Report ──────────────────────────────────────────────

export const getPartsProfitability = query({
  args: {
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(),   // "YYYY-MM-DD"
  },
  handler: async (ctx, args): Promise<Array<{
    partKey: string;
    partName: string;
    partNumber: string;
    category: string;
    supplier: string;
    totalQtySold: number;
    avgUnitCost: number;
    avgUnitPrice: number;
    totalCost: number;
    totalRevenue: number;
    totalProfit: number;
    marginPercent: number;
  }>> => {
    const { orgId } = await getAdminMember(ctx);

    const startISO = args.startDate + "T00:00:00.000Z";
    const endISO = args.endDate + "T23:59:59.999Z";

    // Get completed/invoiced ROs in date range
    const allROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    const rosInRange = allROs.filter((ro) => {
      if (ro.status !== "completed" && ro.status !== "invoiced") return false;
      const completedDate = ro.completedAt ?? new Date(ro._creationTime).toISOString();
      return completedDate >= startISO && completedDate <= endISO;
    });

    // Aggregate parts sold across all ROs
    // Key by partId when available, or by description as fallback
    const partMap = new Map<string, {
      partName: string;
      partNumber: string;
      partId: string | null;
      totalQty: number;
      totalCost: number;
      totalRevenue: number;
    }>();

    for (const ro of rosInRange) {
      for (const line of ro.partLines) {
        if (line.quantity <= 0) continue;
        const key = line.partId ?? `desc:${line.description}`;
        const existing = partMap.get(key);
        const lineCost = line.quantity * line.unitCost;
        const lineRevenue = line.quantity * line.unitPrice;
        if (existing) {
          existing.totalQty += line.quantity;
          existing.totalCost += lineCost;
          existing.totalRevenue += lineRevenue;
          // Keep best name
          if (!existing.partNumber && line.partNumber) {
            existing.partNumber = line.partNumber;
          }
        } else {
          partMap.set(key, {
            partName: line.description,
            partNumber: line.partNumber ?? "",
            partId: line.partId ?? null,
            totalQty: line.quantity,
            totalCost: lineCost,
            totalRevenue: lineRevenue,
          });
        }
      }
    }

    // Enrich from the parts catalog for category/supplier
    const results: Array<{
      partKey: string;
      partName: string;
      partNumber: string;
      category: string;
      supplier: string;
      totalQtySold: number;
      avgUnitCost: number;
      avgUnitPrice: number;
      totalCost: number;
      totalRevenue: number;
      totalProfit: number;
      marginPercent: number;
    }> = [];

    for (const [key, data] of partMap) {
      let category = "Uncategorized";
      let supplier = "";

      // Try to look up the catalog part
      if (data.partId) {
        const catalogPart = await ctx.db.get(data.partId as Id<"parts">);
        if (catalogPart) {
          category = catalogPart.category ?? "Uncategorized";
          supplier = catalogPart.supplier ?? "";
          // Use catalog name if available
          if (catalogPart.name) data.partName = catalogPart.name;
          if (catalogPart.partNumber) data.partNumber = catalogPart.partNumber ?? "";
        }
      }

      const totalProfit = data.totalRevenue - data.totalCost;
      const marginPercent = data.totalRevenue > 0
        ? Math.round((totalProfit / data.totalRevenue) * 1000) / 10
        : 0;

      results.push({
        partKey: key,
        partName: data.partName,
        partNumber: data.partNumber,
        category,
        supplier,
        totalQtySold: data.totalQty,
        avgUnitCost: data.totalQty > 0 ? Math.round((data.totalCost / data.totalQty) * 100) / 100 : 0,
        avgUnitPrice: data.totalQty > 0 ? Math.round((data.totalRevenue / data.totalQty) * 100) / 100 : 0,
        totalCost: Math.round(data.totalCost * 100) / 100,
        totalRevenue: Math.round(data.totalRevenue * 100) / 100,
        totalProfit: Math.round(totalProfit * 100) / 100,
        marginPercent,
      });
    }

    // Sort by total profit descending
    return results.sort((a, b) => b.totalProfit - a.totalProfit);
  },
});

// ─── Customer Retention Report ──────────────────────────────────────────────

export const getCustomerRetention = query({
  args: {
    daysThreshold: v.number(), // e.g. 90, 180, 365
  },
  handler: async (ctx, args): Promise<Array<{
    customerId: Id<"customers">;
    customerName: string;
    phone: string;
    email: string;
    lastVisitDate: string;
    daysSinceVisit: number;
    vehicleSummary: string;
    totalSpend: number;
    visitCount: number;
  }>> => {
    const { orgId } = await getAdminMember(ctx);

    const now = new Date();
    const thresholdDate = new Date(now.getTime() - args.daysThreshold * 24 * 60 * 60 * 1000);
    const thresholdISO = thresholdDate.toISOString();

    // Get all customers
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    // Get all completed/invoiced ROs for computing last visit and total spend
    const allROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    // Get all invoices for spend calculation
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();

    // Build per-customer data
    const results: Array<{
      customerId: Id<"customers">;
      customerName: string;
      phone: string;
      email: string;
      lastVisitDate: string;
      daysSinceVisit: number;
      vehicleSummary: string;
      totalSpend: number;
      visitCount: number;
    }> = [];

    for (const customer of customers) {
      // Find ROs for this customer (completed or invoiced)
      const customerROs = allROs.filter(
        (ro) => ro.customerId === customer._id &&
          (ro.status === "completed" || ro.status === "invoiced")
      );

      if (customerROs.length === 0) continue; // Skip customers who've never completed a visit

      // Find the most recent completed date
      const sortedROs = customerROs.sort((a, b) => {
        const aDate = a.completedAt ?? new Date(a._creationTime).toISOString();
        const bDate = b.completedAt ?? new Date(b._creationTime).toISOString();
        return bDate.localeCompare(aDate); // desc
      });

      const lastRO = sortedROs[0];
      const lastVisitDate = lastRO.completedAt ?? new Date(lastRO._creationTime).toISOString();

      // Only include if last visit is older than threshold
      if (lastVisitDate > thresholdISO) continue;

      const daysSinceVisit = Math.floor(
        (now.getTime() - new Date(lastVisitDate).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Total spend from paid invoices
      const customerInvoices = allInvoices.filter(
        (inv) => inv.customerId === customer._id &&
          (inv.status === "paid" || inv.status === "partial")
      );
      const totalSpend = customerInvoices.reduce((s, inv) => s + inv.amountPaid, 0);

      // Get vehicle info from the last RO
      let vehicleSummary = "Unknown Vehicle";
      if (lastRO.vehicleId) {
        const vehicle = await ctx.db.get(lastRO.vehicleId);
        if (vehicle) {
          vehicleSummary = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
        }
      }

      results.push({
        customerId: customer._id,
        customerName: customer.name,
        phone: customer.phone ?? "",
        email: customer.email ?? "",
        lastVisitDate,
        daysSinceVisit,
        vehicleSummary,
        totalSpend: Math.round(totalSpend * 100) / 100,
        visitCount: customerROs.length,
      });
    }

    // Sort by days since visit descending (longest absence first)
    return results.sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);
  },
});
