import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import {
  calculatePayStub,
  last4,
  PERIODS_PER_YEAR,
  yearEndFromStubs,
  type EmploymentType,
  type FilingStatus,
  type PayFrequency,
} from "../src/lib/payrollCalc.ts";

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

async function requirePayrollAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await getAuthedUser(ctx);
  if (!user.currentOrgId) throw new ConvexError({ message: "No org selected", code: "FORBIDDEN" });
  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member || !member.isActive) {
    throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });
  }
  if (!["owner", "admin"].includes(member.role) && !member.hasAdminAccess) {
    throw new ConvexError({ message: "Payroll access required", code: "FORBIDDEN" });
  }
  return { user, member, orgId: user.currentOrgId };
}

function hoursInPeriod(
  entries: Array<{ clockInAt: string; clockOutAt?: string; totalHours?: number }>,
  start: string,
  end: string,
): number {
  const endOf = end.length === 10 ? `${end}T23:59:59.999Z` : end;
  let hours = 0;
  for (const e of entries) {
    if (e.clockInAt < start || e.clockInAt > endOf) continue;
    hours += e.totalHours ?? 0;
  }
  return hours;
}

export const generatePayroll = mutation({
  args: {
    payPeriodStart: v.string(),
    payPeriodEnd: v.string(),
    checkDate: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requirePayrollAdmin(ctx);
    if (args.payPeriodEnd < args.payPeriodStart) {
      throw new ConvexError({ message: "payPeriodEnd must be on or after payPeriodStart", code: "BAD_REQUEST" });
    }

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const active = members.filter((m) => m.isActive && m.inviteStatus !== "pending");
    if (active.length === 0) {
      throw new ConvexError({ message: "No active employees found", code: "BAD_REQUEST" });
    }

    const timeEntries = await ctx.db
      .query("timeEntries")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(5000);

    const yearPrefix = args.checkDate.slice(0, 4);
    const existingStubs = await ctx.db
      .query("payStubs")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(5000);
    const ytdStubs = existingStubs.filter((s) => s.checkDate.startsWith(yearPrefix));

    const runId = await ctx.db.insert("payrollRuns", {
      orgId,
      payPeriodStart: args.payPeriodStart,
      payPeriodEnd: args.payPeriodEnd,
      checkDate: args.checkDate,
      createdByUserId: user._id,
      employeesProcessed: 0,
      totalGrossPay: 0,
      totalNetPay: 0,
      totalDeductions: 0,
      status: "finalized",
      notes: args.notes,
    });

    let totalGross = 0;
    let totalNet = 0;
    let totalDed = 0;
    let processed = 0;

    for (const emp of active) {
      const empEntries = timeEntries.filter((t) => t.memberId === emp._id);
      const hours = hoursInPeriod(empEntries, args.payPeriodStart, args.payPeriodEnd);
      const frequency = (emp.payFrequency ?? "biweekly") as PayFrequency;
      const periods = PERIODS_PER_YEAR[frequency] ?? 26;
      const periodSalary = emp.annualSalary && emp.annualSalary > 0 ? emp.annualSalary / periods : 0;
      const employmentType = (emp.employmentType ?? "w2") as EmploymentType;

      const prior = ytdStubs.filter((s) => s.memberId === emp._id);
      const ytdGross = prior.reduce((s, x) => s + x.grossPay, 0);
      const ytdDeductions = prior.reduce((s, x) => s + x.totalDeductions, 0);
      const ytdNet = prior.reduce((s, x) => s + x.netPay, 0);
      const ytdSs = prior.reduce((s, x) => s + x.socialSecurityTax / 0.062, 0);

      const advances = await ctx.db
        .query("payrollDeductions")
        .withIndex("by_member_status", (q) => q.eq("memberId", emp._id).eq("status", "active"))
        .collect();

      const calc = calculatePayStub({
        employmentType,
        hours,
        hourlyRate: emp.hourlyRate ?? 0,
        overtimeMultiplier: emp.overtimeMultiplier,
        periodSalary,
        filingStatus: (emp.filingStatus ?? "single") as FilingStatus,
        frequency,
        stateTaxRate: emp.stateTaxRate,
        ytdGross,
        ytdDeductions,
        ytdNet,
        ytdSocialSecurityWages: ytdSs,
        advances: advances.map((a) => ({
          id: a._id,
          description: a.description,
          remaining: Math.max(0, a.totalAmount - a.amountApplied),
          amountPerCheck: a.amountPerCheck,
        })),
      });

      const empUser = await ctx.db.get(emp.userId);
      await ctx.db.insert("payStubs", {
        orgId,
        payrollRunId: runId,
        memberId: emp._id,
        employeeName: empUser?.name ?? emp.inviteEmail ?? "Employee",
        employmentType,
        checkDate: args.checkDate,
        payPeriodStart: args.payPeriodStart,
        payPeriodEnd: args.payPeriodEnd,
        regularHours: calc.regularHours,
        overtimeHours: calc.overtimeHours,
        regularRate: calc.regularRate,
        overtimeRate: calc.overtimeRate,
        regularPay: calc.regularPay,
        overtimePay: calc.overtimePay,
        bonusOrOther: calc.bonusOrOther,
        grossPay: calc.grossPay,
        federalIncomeTax: calc.deductions.federalIncomeTax,
        socialSecurityTax: calc.deductions.socialSecurityTax,
        medicareTax: calc.deductions.medicareTax,
        stateIncomeTax: calc.deductions.stateIncomeTax,
        otherDeductions: calc.deductions.other,
        advancesDeducted: calc.deductions.advances,
        advancesDetail: calc.deductions.advancesDetail,
        totalDeductions: calc.deductions.total,
        netPay: calc.netPay,
        ytdGross: calc.yearToDate.grossPay,
        ytdDeductions: calc.yearToDate.deductions,
        ytdNet: calc.yearToDate.netPay,
      });

      const now = new Date().toISOString();
      for (const applied of calc.deductions.advancesDetail) {
        const deduction = advances.find((a) => a._id === applied.id);
        if (!deduction) continue;
        const nextApplied = deduction.amountApplied + applied.amount;
        await ctx.db.patch(deduction._id, {
          amountApplied: nextApplied,
          status: nextApplied + 0.009 >= deduction.totalAmount ? "paid_off" : "active",
        });
        await ctx.db.insert("deductionPayments", {
          orgId,
          deductionId: deduction._id,
          memberId: emp._id,
          amount: applied.amount,
          appliedAt: now,
          note: `Payroll ${args.payPeriodStart} – ${args.payPeriodEnd}`,
        });
      }

      totalGross += calc.grossPay;
      totalNet += calc.netPay;
      totalDed += calc.deductions.total;
      processed += 1;
    }

    await ctx.db.patch(runId, {
      employeesProcessed: processed,
      totalGrossPay: totalGross,
      totalNetPay: totalNet,
      totalDeductions: totalDed,
    });

    return { runId, employeesProcessed: processed, totalGrossPay: totalGross, totalNetPay: totalNet };
  },
});

export const listPayrollRuns = query({
  args: {},
  handler: async (ctx) => {
    const { orgId } = await requirePayrollAdmin(ctx);
    return await ctx.db
      .query("payrollRuns")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(100);
  },
});

export const getPayrollRun = query({
  args: { runId: v.id("payrollRuns") },
  handler: async (ctx, args) => {
    const { orgId } = await requirePayrollAdmin(ctx);
    const run = await ctx.db.get(args.runId);
    if (!run || run.orgId !== orgId) return null;
    const stubs = await ctx.db
      .query("payStubs")
      .withIndex("by_run", (q) => q.eq("payrollRunId", args.runId))
      .collect();
    return { run, stubs: stubs.filter((s) => s.orgId === orgId) };
  },
});

export const getPayStub = query({
  args: { stubId: v.id("payStubs") },
  handler: async (ctx, args) => {
    const { orgId, member } = await requirePayrollAdmin(ctx).catch(async (err) => {
      // Techs can read their own stub
      const identityUser = await getAuthedUser(ctx);
      if (!identityUser.currentOrgId) throw err;
      const m = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", identityUser.currentOrgId!).eq("userId", identityUser._id),
        )
        .first();
      if (!m) throw err;
      return { orgId: identityUser.currentOrgId, user: identityUser, member: m };
    });
    const stub = await ctx.db.get(args.stubId);
    if (!stub || stub.orgId !== orgId) return null;
    const isAdmin = ["owner", "admin"].includes(member.role) || member.hasAdminAccess;
    if (!isAdmin && stub.memberId !== member._id) return null;
    const emp = await ctx.db.get(stub.memberId);
    return {
      ...stub,
      ssnMasked: maskLast4(emp?.ssnLast4),
      taxIdMasked: maskLast4(emp?.taxIdLast4),
      jobTitle: emp?.jobTitle,
      payAddress: emp?.payAddress,
    };
  },
});

function maskLast4(value?: string | null) {
  const four = last4(value ?? undefined);
  return four ? `***-**-${four}` : null;
}

export const getYearEndReport = query({
  args: { year: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requirePayrollAdmin(ctx);
    if (args.year < 2000 || args.year > 2100) {
      throw new ConvexError({ message: "Invalid year", code: "BAD_REQUEST" });
    }
    const prefix = `${args.year}-`;
    const stubs = (await ctx.db.query("payStubs").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(5000))
      .filter((s) => s.checkDate.startsWith(prefix));

    const byMember = new Map<string, typeof stubs>();
    for (const s of stubs) {
      const list = byMember.get(s.memberId) ?? [];
      list.push(s);
      byMember.set(s.memberId, list);
    }

    const employees = [];
    for (const [memberId, list] of byMember) {
      const member = await ctx.db.get(memberId as Id<"orgMembers">);
      const userDoc = member ? await ctx.db.get(member.userId) : null;
      const type = list[0]?.employmentType ?? member?.employmentType ?? "w2";
      const boxes = yearEndFromStubs(type, list.map((s) => ({
        grossPay: s.grossPay,
        deductions: {
          federalIncomeTax: s.federalIncomeTax,
          socialSecurityTax: s.socialSecurityTax,
          medicareTax: s.medicareTax,
        },
      })));
      employees.push({
        memberId,
        name: userDoc?.name ?? "Unknown",
        employmentType: type,
        totalGrossPay: type === "1099" ? boxes.nonemployeeCompensation : boxes.wages,
        totalTaxWithheld: boxes.federalWithheld + boxes.socialSecurityWithheld + boxes.medicareWithheld,
        documentType: type === "w2" ? "W2" : "1099",
        boxes,
      });
    }

    return {
      year: args.year,
      employees,
      summary: {
        totalEmployees: employees.length,
        w2Employees: employees.filter((e) => e.employmentType === "w2").length,
        contractorEmployees: employees.filter((e) => e.employmentType === "1099").length,
        totalPayroll: employees.reduce((s, e) => s + e.totalGrossPay, 0),
        totalTaxesPaid: employees.reduce((s, e) => s + e.totalTaxWithheld, 0),
      },
    };
  },
});

export const getW2 = query({
  args: { memberId: v.id("orgMembers"), year: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requirePayrollAdmin(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.orgId !== orgId) return null;
    if ((member.employmentType ?? "w2") !== "w2") {
      throw new ConvexError({ message: "W-2 is only for W-2 employees", code: "BAD_REQUEST" });
    }
    const userDoc = await ctx.db.get(member.userId);
    const prefix = `${args.year}-`;
    const stubs = (await ctx.db.query("payStubs").withIndex("by_member", (q) => q.eq("memberId", args.memberId)).take(500))
      .filter((s) => s.orgId === orgId && s.checkDate.startsWith(prefix));
    const boxes = yearEndFromStubs("w2", stubs.map((s) => ({
      grossPay: s.grossPay,
      deductions: {
        federalIncomeTax: s.federalIncomeTax,
        socialSecurityTax: s.socialSecurityTax,
        medicareTax: s.medicareTax,
      },
    })));
    return {
      year: args.year,
      employee: {
        name: userDoc?.name ?? "Unknown",
        ssn: maskLast4(member.ssnLast4),
        address: member.payAddress,
      },
      boxes: {
        1: { description: "Wages, tips, other compensation", value: boxes.wages },
        2: { description: "Federal income tax withheld", value: boxes.federalWithheld },
        3: { description: "Social security wages", value: boxes.socialSecurityWages },
        4: { description: "Social security tax withheld", value: boxes.socialSecurityWithheld },
        5: { description: "Medicare wages and tips", value: boxes.medicareWages },
        6: { description: "Medicare tax withheld", value: boxes.medicareWithheld },
      },
    };
  },
});

export const get1099 = query({
  args: { memberId: v.id("orgMembers"), year: v.number() },
  handler: async (ctx, args) => {
    const { orgId } = await requirePayrollAdmin(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member || member.orgId !== orgId) return null;
    if (member.employmentType !== "1099") {
      throw new ConvexError({ message: "1099 is only for contractors", code: "BAD_REQUEST" });
    }
    const userDoc = await ctx.db.get(member.userId);
    const prefix = `${args.year}-`;
    const stubs = (await ctx.db.query("payStubs").withIndex("by_member", (q) => q.eq("memberId", args.memberId)).take(500))
      .filter((s) => s.orgId === orgId && s.checkDate.startsWith(prefix));
    const boxes = yearEndFromStubs("1099", stubs.map((s) => ({
      grossPay: s.grossPay,
      deductions: {
        federalIncomeTax: s.federalIncomeTax,
        socialSecurityTax: s.socialSecurityTax,
        medicareTax: s.medicareTax,
      },
    })));
    return {
      year: args.year,
      contractor: {
        name: userDoc?.name ?? "Unknown",
        taxId: maskLast4(member.taxIdLast4),
        address: member.payAddress,
      },
      income: { nonemployeeCompensation: boxes.nonemployeeCompensation },
    };
  },
});
