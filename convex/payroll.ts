import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

async function getAuthedUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Tech's own pay records — only returns records for the currently-authed user.
 * Techs call this to see their private earnings history.
 */
export const getMyPayRecords = query({
  args: {},
  handler: async (ctx): Promise<Array<Doc<"techPayRecords">>> => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    // Find this user's member record in their current org
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
      )
      .first();
    if (!member) return [];

    return await ctx.db
      .query("techPayRecords")
      .withIndex("by_member_paidAt", (q) => q.eq("memberId", member._id))
      .order("desc")
      .take(200);
  },
});

/**
 * Manager view — pay records for a specific tech member.
 * Only owners/admins/service_writers should call this.
 */
export const getTechPayRecords = query({
  args: { memberId: v.id("orgMembers") },
  handler: async (ctx, args): Promise<Array<Doc<"techPayRecords">>> => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    // Verify the caller is a manager-level member of the same org
    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
      )
      .first();
    if (!callerMember) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
    if (!["owner", "admin", "service_writer"].includes(callerMember.role)) {
      throw new ConvexError({ message: "Insufficient permissions", code: "FORBIDDEN" });
    }

    return await ctx.db
      .query("techPayRecords")
      .withIndex("by_member_paidAt", (q) => q.eq("memberId", args.memberId))
      .order("desc")
      .take(200);
  },
});

/**
 * Org-level pay summary — total hours & earnings per tech for a date range.
 * Used in admin/manager reporting.
 */
export const getOrgPaySummary = query({
  args: {
    startDate: v.optional(v.string()), // ISO date string, inclusive
    endDate: v.optional(v.string()),   // ISO date string, inclusive
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
      )
      .first();
    if (!callerMember) return [];
    if (!["owner", "admin", "service_writer"].includes(callerMember.role)) return [];

    let records = await ctx.db
      .query("techPayRecords")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(1000);

    // Filter by date range if provided
    if (args.startDate) {
      records = records.filter((r) => r.paidAt >= args.startDate!);
    }
    if (args.endDate) {
      // end of end date day
      const endOfDay = args.endDate + "T23:59:59.999Z";
      records = records.filter((r) => r.paidAt <= endOfDay);
    }

    // Group by memberId
    const byMember = new Map<
      string,
      { memberId: string; totalHours: number; totalEarned: number; jobCount: number; employmentType?: "w2" | "1099" }
    >();

    for (const r of records) {
      const key = r.memberId;
      const existing = byMember.get(key);
      if (existing) {
        existing.totalHours += r.totalHours;
        existing.totalEarned += r.totalEarned;
        existing.jobCount += 1;
      } else {
        byMember.set(key, {
          memberId: r.memberId,
          totalHours: r.totalHours,
          totalEarned: r.totalEarned,
          jobCount: 1,
          employmentType: r.employmentType,
        });
      }
    }

    // Enrich with member names
    const summaries = await Promise.all(
      Array.from(byMember.values()).map(async (s) => {
        const member = await ctx.db.get(s.memberId as Doc<"techPayRecords">["memberId"]);
        const userDoc = member ? await ctx.db.get(member.userId) : null;
        return {
          ...s,
          memberName: userDoc?.name ?? "Unknown",
          role: member?.role ?? "mechanic",
        };
      })
    );

    return summaries.sort((a, b) => b.totalEarned - a.totalEarned);
  },
});

/**
 * All org pay records (raw) — used for CSV export in the admin portal.
 * Only owners/admins/service_writers can call this.
 */
export const getAllOrgPayRecords = query({
  args: {
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<Doc<"techPayRecords"> & { memberName: string; role: string }>
  > => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id),
      )
      .first();
    if (!callerMember) return [];
    if (!["owner", "admin", "service_writer"].includes(callerMember.role))
      return [];

    let records = await ctx.db
      .query("techPayRecords")
      .withIndex("by_org_paidAt", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(1000);

    if (args.startDate) {
      records = records.filter((r) => r.paidAt >= args.startDate!);
    }
    if (args.endDate) {
      const endOfDay = args.endDate + "T23:59:59.999Z";
      records = records.filter((r) => r.paidAt <= endOfDay);
    }

    return await Promise.all(
      records.map(async (r) => {
        const member = await ctx.db.get(r.memberId);
        const userDoc = member ? await ctx.db.get(member.userId) : null;
        return {
          ...r,
          memberName: userDoc?.name ?? "Unknown",
          role: member?.role ?? "mechanic",
        };
      }),
    );
  },
});

/**
 * Billable hours report — aggregates labor hours from repair orders by assigned tech.
 * This shows ALL billable labor (from ROs), not just paid invoices.
 * Managers can filter by date range to run payroll reports on demand.
 */
export const getBillableHoursReport = query({
  args: {
    startDate: v.optional(v.string()), // ISO date, filters by RO creation
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const callerMember = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("userId", user._id)
      )
      .first();
    if (!callerMember) return [];
    if (!["owner", "admin", "service_writer"].includes(callerMember.role)) return [];

    // Get assigned ROs for this org (bounded to prevent system limit issues)
    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(2000);

    // Filter assigned ROs and optionally by date range
    const filtered = ros.filter((ro) => {
      if (!ro.assignedTo) return false;
      const roDate = ro.scheduledAt ?? new Date(ro._creationTime).toISOString();
      if (args.startDate && roDate < args.startDate) return false;
      if (args.endDate && roDate > args.endDate + "T23:59:59.999Z") return false;
      return true;
    });

    // Group by assigned mechanic
    const byTech = new Map<
      string,
      {
        memberId: string;
        totalBillableHours: number;
        totalLaborRevenue: number;
        jobCount: number;
        statuses: Record<string, number>;
        jobs: Array<{
          roId: string;
          roNumber: string;
          customerName: string;
          vehicleSummary: string;
          status: string;
          laborHours: number;
          laborRevenue: number;
          date: string;
        }>;
      }
    >();

    for (const ro of filtered) {
      const key = ro.assignedTo!;
      const laborHours = ro.laborLines.reduce((sum, l) => sum + l.laborHours, 0);
      const laborRevenue = ro.laborLines.reduce((sum, l) => sum + l.laborHours * l.laborRate, 0);

      const customer = await ctx.db.get(ro.customerId);
      const vehicle = await ctx.db.get(ro.vehicleId);

      const job = {
        roId: ro._id,
        roNumber: ro.roNumber,
        customerName: customer?.name ?? "Unknown",
        vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown",
        status: ro.status,
        laborHours,
        laborRevenue,
        date: ro.scheduledAt ?? new Date(ro._creationTime).toISOString().split("T")[0],
      };

      const existing = byTech.get(key);
      if (existing) {
        existing.totalBillableHours += laborHours;
        existing.totalLaborRevenue += laborRevenue;
        existing.jobCount += 1;
        existing.statuses[ro.status] = (existing.statuses[ro.status] ?? 0) + 1;
        existing.jobs.push(job);
      } else {
        byTech.set(key, {
          memberId: key,
          totalBillableHours: laborHours,
          totalLaborRevenue: laborRevenue,
          jobCount: 1,
          statuses: { [ro.status]: 1 },
          jobs: [job],
        });
      }
    }

    // Enrich with tech names
    const results = await Promise.all(
      Array.from(byTech.values()).map(async (entry) => {
        const member = await ctx.db.get(entry.memberId as Id<"orgMembers">);
        const userDoc = member ? await ctx.db.get(member.userId) : null;
        return {
          ...entry,
          memberName: userDoc?.name ?? "Unknown",
          role: member?.role ?? "mechanic",
          employmentType: member?.employmentType,
        };
      })
    );

    return results.sort((a, b) => b.totalBillableHours - a.totalBillableHours);
  },
});
