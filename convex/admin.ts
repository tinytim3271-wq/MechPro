import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getAuthedMember(ctx: QueryCtx | MutationCtx): Promise<{
  user: Doc<"users">;
  member: Doc<"orgMembers">;
}> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });

  const member = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
    .first();
  if (!member) throw new ConvexError({ message: "Not a member", code: "FORBIDDEN" });

  return { user, member };
}

// ─── Role helpers ─────────────────────────────────────────────────────────────

const ADMIN_ROLES = ["owner", "admin"] as const;

function isAdminRole(role: string): boolean {
  return (ADMIN_ROLES as readonly string[]).includes(role);
}

// Check if a member has admin-level access (either by role or explicit grant)
function hasAdminPermission(member: Doc<"orgMembers">): boolean {
  return isAdminRole(member.role) || member.hasAdminAccess === true;
}

async function assertUserInOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  userId: Id<"users">,
): Promise<void> {
  const membership = await ctx.db
    .query("orgMembers")
    .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", userId))
    .first();
  if (!membership?.isActive) {
    throw new ConvexError({ message: "User is not a member of this organization", code: "FORBIDDEN" });
  }
}

async function assertEmailInOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  email: string,
): Promise<void> {
  const members = await ctx.db
    .query("orgMembers")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();

  for (const member of members) {
    if (member.inviteEmail?.toLowerCase() === email) return;
    const memberUser = await ctx.db.get(member.userId);
    if (memberUser?.email?.toLowerCase() === email) return;
  }

  throw new ConvexError({ message: "Email is not associated with this organization", code: "FORBIDDEN" });
}

// ─── Get current user's role in their org ────────────────────────────────────

export const getMyRole = query({
  args: {},
  handler: async (ctx): Promise<{
    role: string;
    orgId: Id<"organizations">;
    memberId: Id<"orgMembers">;
    userId: Id<"users">;
    userName: string;
    hasAdminAccess: boolean;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member) return null;

    return {
      role: member.role,
      orgId: user.currentOrgId,
      memberId: member._id,
      userId: user._id,
      userName: user.name ?? "Unknown",
      hasAdminAccess: member.hasAdminAccess ?? false,
    };
  },
});

// ─── Admin: full org stats ────────────────────────────────────────────────────

export const getAdminStats = query({
  args: {},
  handler: async (ctx) => {
    const { user, member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const orgId = user.currentOrgId!;

    const [allROs, allInvoices, allMembers, allCustomers, allParts, allPOs] = await Promise.all([
      ctx.db.query("repairOrders").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(2000),
      ctx.db.query("invoices").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(2000),
      ctx.db.query("orgMembers").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(200),
      ctx.db.query("customers").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(2000),
      ctx.db.query("parts").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(1000),
      ctx.db.query("purchaseOrders").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(500),
    ]);

    const totalRevenue = allInvoices
      .filter((i) => i.status === "paid" || i.status === "partial")
      .reduce((s, i) => s + i.amountPaid, 0);

    const outstanding = allInvoices
      .filter((i) => i.status !== "paid" && i.status !== "void")
      .reduce((s, i) => s + (i.total - i.amountPaid), 0);

    const lowStockParts = allParts.filter((p) => p.stockQty <= p.lowStockThreshold);

    // Revenue by status bucket
    const revenueByStatus = {
      paid: allInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.total, 0),
      partial: allInvoices.filter((i) => i.status === "partial").reduce((s, i) => s + i.amountPaid, 0),
      draft: allInvoices.filter((i) => i.status === "draft").reduce((s, i) => s + i.total, 0),
    };

    // ROs by status
    const roByStatus = {
      estimate: allROs.filter((r) => r.status === "estimate").length,
      approved: allROs.filter((r) => r.status === "approved").length,
      in_progress: allROs.filter((r) => r.status === "in_progress").length,
      waiting_parts: allROs.filter((r) => r.status === "waiting_parts").length,
      completed: allROs.filter((r) => r.status === "completed").length,
      invoiced: allROs.filter((r) => r.status === "invoiced").length,
      cancelled: allROs.filter((r) => r.status === "cancelled").length,
    };

    // Member count by role
    const membersByRole = allMembers.reduce<Record<string, number>>((acc, m) => {
      acc[m.role] = (acc[m.role] ?? 0) + 1;
      return acc;
    }, {});

    // Recent 30 days revenue trend (group by day)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentPayments: { date: string; amount: number }[] = [];
    for (const inv of allInvoices) {
      for (const pmt of inv.payments) {
        const pmtDate = new Date(pmt.paidAt);
        if (pmtDate >= thirtyDaysAgo) {
          const dateKey = pmtDate.toISOString().slice(0, 10);
          const existing = recentPayments.find((p) => p.date === dateKey);
          if (existing) {
            existing.amount += pmt.amount;
          } else {
            recentPayments.push({ date: dateKey, amount: pmt.amount });
          }
        }
      }
    }
    recentPayments.sort((a, b) => a.date.localeCompare(b.date));

    return {
      totalRevenue,
      outstanding,
      totalROs: allROs.length,
      totalCustomers: allCustomers.length,
      activeMembers: allMembers.filter((m) => m.isActive).length,
      totalMembers: allMembers.length,
      lowStockCount: lowStockParts.length,
      pendingPOs: allPOs.filter((p) => p.status === "sent").length,
      roByStatus,
      revenueByStatus,
      membersByRole,
      revenueByDay: recentPayments,
    };
  },
});

// ─── Admin: all ROs with full detail ─────────────────────────────────────────

export const getAllROs = query({
  args: {
    status: v.optional(v.string()),
    assignedTo: v.optional(v.id("orgMembers")),
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const orgId = user.currentOrgId!;

    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(300);

    const filtered = ros.filter((r) => {
      if (args.status && r.status !== args.status) return false;
      if (args.assignedTo && r.assignedTo !== args.assignedTo) return false;
      return true;
    });

    return await Promise.all(
      filtered.map(async (ro) => {
        const [customer, vehicle] = await Promise.all([
          ctx.db.get(ro.customerId),
          ctx.db.get(ro.vehicleId),
        ]);
        let assignedMemberName: string | undefined;
        if (ro.assignedTo) {
          const m = await ctx.db.get(ro.assignedTo);
          if (m) {
            const u = await ctx.db.get(m.userId);
            assignedMemberName = u?.name ?? m.inviteEmail ?? "Unknown";
          }
        }
        return {
          ...ro,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown",
          assignedMemberName,
        };
      })
    );
  },
});

// ─── Admin: all invoices ──────────────────────────────────────────────────────

export const getAllInvoices = query({
  args: {},
  handler: async (ctx) => {
    const { user, member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const orgId = user.currentOrgId!;

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(200);

    return await Promise.all(
      invoices.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        return { ...inv, customerName: customer?.name ?? "Unknown" };
      })
    );
  },
});

// ─── Admin: list all members with assigned RO counts ─────────────────────────

export const getAdminMembers = query({
  args: {},
  handler: async (ctx) => {
    const { user, member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const orgId = user.currentOrgId!;

    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .take(500);

    const activeROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) =>
        q.or(
          q.eq(q.field("status"), "in_progress"),
          q.eq(q.field("status"), "approved"),
          q.eq(q.field("status"), "waiting_parts")
        )
      )
      .take(1000);

    return await Promise.all(
      members.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        const assignedJobs = activeROs.filter((ro) => ro.assignedTo === m._id).length;
        return {
          ...m,
          userName: u?.name ?? m.inviteEmail ?? "Unknown",
          userEmail: u?.email ?? m.inviteEmail,
          avatarUrl: u?.avatarUrl,
          assignedJobs,
        };
      })
    );
  },
});

// ─── Admin: reassign RO ───────────────────────────────────────────────────────

export const reassignRO = mutation({
  args: {
    roId: v.id("repairOrders"),
    memberId: v.optional(v.id("orgMembers")),
  },
  handler: async (ctx, args) => {
    const { member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    await ctx.db.patch(args.roId, { assignedTo: args.memberId });
  },
});

// ─── Admin: Financial Report ─────────────────────────────────────────────────

export const getFinancialReport = query({
  args: {
    startDate: v.string(), // "YYYY-MM-DD"
    endDate: v.string(),   // "YYYY-MM-DD"
  },
  handler: async (ctx, args): Promise<{
    totalRevenue: number;
    paidInvoiceCount: number;
    outstanding: number;
    outstandingCount: number;
    averageInvoice: number;
    totalLaborRevenue: number;
    totalPartsRevenue: number;
    totalPayrollCost: number;
    netMargin: number;
    invoices: Array<{
      invoiceNumber: string;
      customerName: string;
      vehicleSummary: string;
      total: number;
      amountPaid: number;
      balance: number;
      status: string;
      issuedAt: string;
    }>;
    payrollByTech: Array<{
      memberName: string;
      totalHours: number;
      totalEarned: number;
      employmentType?: string;
    }>;
  }> => {
    const { user, member } = await getAuthedMember(ctx);
    if (!hasAdminPermission(member)) throw new ConvexError({ message: "Forbidden", code: "FORBIDDEN" });
    const orgId = user.currentOrgId!;

    const startISO = args.startDate + "T00:00:00.000Z";
    const endISO = args.endDate + "T23:59:59.999Z";

    // Get invoices in date range
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(2000);
    const rangeInvoices = allInvoices.filter(
      (inv) => inv.issuedAt >= startISO && inv.issuedAt <= endISO
    );

    const paidInvoices = rangeInvoices.filter((inv) => inv.status === "paid");
    const unpaidInvoices = rangeInvoices.filter(
      (inv) => inv.status !== "paid" && inv.status !== "void"
    );

    const totalRevenue = paidInvoices.reduce((s, inv) => s + inv.amountPaid, 0);
    const outstanding = unpaidInvoices.reduce(
      (s, inv) => s + (inv.total - inv.amountPaid),
      0
    );

    // Enrich invoices with customer/vehicle names and labor/parts breakdown
    const enrichedInvoices = await Promise.all(
      rangeInvoices.map(async (inv) => {
        const customer = await ctx.db.get(inv.customerId);
        const ro = await ctx.db.get(inv.roId);
        const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;

        const laborTotal = ro
          ? ro.laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0)
          : 0;
        const partsTotal = ro
          ? ro.partLines.reduce((s, p) => s + p.quantity * p.unitPrice, 0)
          : 0;

        return {
          invoiceNumber: inv.invoiceNumber,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle
            ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            : "Unknown",
          total: inv.total,
          amountPaid: inv.amountPaid,
          balance: inv.total - inv.amountPaid,
          status: inv.status,
          issuedAt: inv.issuedAt,
          laborTotal,
          partsTotal,
        };
      })
    );

    const totalLaborRevenue = enrichedInvoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.laborTotal, 0);
    const totalPartsRevenue = enrichedInvoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.partsTotal, 0);

    // Get payroll in date range using the by_org_paidAt index
    const rangePayroll = await ctx.db
      .query("techPayRecords")
      .withIndex("by_org_paidAt", (q) =>
        q.eq("orgId", orgId).gte("paidAt", startISO).lte("paidAt", endISO)
      )
      .collect();

    const totalPayrollCost = rangePayroll.reduce((s, r) => s + r.totalEarned, 0);
    const netMargin = totalRevenue - totalPayrollCost;

    // Group payroll by member
    const payrollMap = new Map<
      string,
      { memberName: string; totalHours: number; totalEarned: number; employmentType?: string }
    >();
    for (const r of rangePayroll) {
      const key = r.memberId as string;
      const existing = payrollMap.get(key);
      if (existing) {
        existing.totalHours += r.totalHours;
        existing.totalEarned += r.totalEarned;
      } else {
        const memberDoc = await ctx.db.get(r.memberId);
        const userDoc = memberDoc ? await ctx.db.get(memberDoc.userId) : null;
        payrollMap.set(key, {
          memberName: userDoc?.name ?? "Unknown",
          totalHours: r.totalHours,
          totalEarned: r.totalEarned,
          employmentType: r.employmentType,
        });
      }
    }

    return {
      totalRevenue,
      paidInvoiceCount: paidInvoices.length,
      outstanding,
      outstandingCount: unpaidInvoices.length,
      averageInvoice:
        paidInvoices.length > 0 ? totalRevenue / paidInvoices.length : 0,
      totalLaborRevenue,
      totalPartsRevenue,
      totalPayrollCost,
      netMargin,
      invoices: enrichedInvoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        customerName: i.customerName,
        vehicleSummary: i.vehicleSummary,
        total: i.total,
        amountPaid: i.amountPaid,
        balance: i.balance,
        status: i.status,
        issuedAt: i.issuedAt,
      })),
      payrollByTech: Array.from(payrollMap.values()).sort(
        (a, b) => b.totalEarned - a.totalEarned
      ),
    };
  },
});

// ─── Tech: get my assigned ROs ────────────────────────────────────────────────

export const getMyAssignedROs = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member) return [];

    const allROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(200);

    const assigned = allROs.filter((r) =>
      r.assignedTo === member._id &&
      r.status !== "cancelled" &&
      r.status !== "invoiced"
    );

    return await Promise.all(
      assigned.map(async (ro) => {
        const [customer, vehicle] = await Promise.all([
          ctx.db.get(ro.customerId),
          ctx.db.get(ro.vehicleId),
        ]);
        return {
          ...ro,
          customerName: customer?.name ?? "Unknown",
          customerPhone: customer?.phone,
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown",
          vehicleEngine: vehicle?.engine,
          vehicleMileage: vehicle?.mileageIn,
          vehicleVin: vehicle?.vin,
        };
      })
    );
  },
});

// ─── Free access management (owner-only) ────────────────────────────────────

export const grantFreeAccess = mutation({
  args: {
    userId: v.id("users"),
    durationDays: v.number(), // how many days of free access to grant
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);
    if (member.role !== "owner") {
      throw new ConvexError({ message: "Only owners can grant free access", code: "FORBIDDEN" });
    }
    await assertUserInOrg(ctx, user.currentOrgId!, args.userId);
    const expiresAt = new Date(Date.now() + args.durationDays * 24 * 60 * 60 * 1000).toISOString();
    await ctx.db.patch(args.userId, { freeAccessUntil: expiresAt });
    return { success: true, expiresAt };
  },
});

export const revokeFreeAccess = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);
    if (member.role !== "owner") {
      throw new ConvexError({ message: "Only owners can revoke free access", code: "FORBIDDEN" });
    }
    await assertUserInOrg(ctx, user.currentOrgId!, args.userId);
    await ctx.db.patch(args.userId, { freeAccessUntil: undefined });
    return { success: true };
  },
});

// Grant free access by email — creates user record if needed
export const grantFreeAccessByEmail = mutation({
  args: {
    email: v.string(),
    durationDays: v.number(),
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);
    if (member.role !== "owner") {
      throw new ConvexError({ message: "Only owners can grant free access", code: "FORBIDDEN" });
    }

    const normalizedEmail = args.email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new ConvexError({ message: "Invalid email address", code: "BAD_REQUEST" });
    }

    await assertEmailInOrg(ctx, user.currentOrgId!, normalizedEmail);

    const expiresAt = new Date(Date.now() + args.durationDays * 24 * 60 * 60 * 1000).toISOString();

    const existingUser =
      (await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
        .first()) ??
      (await ctx.db
        .query("users")
        .filter((q) => q.eq(q.field("email"), normalizedEmail))
        .first());

    if (existingUser) {
      // Grant access to existing user
      await ctx.db.patch(existingUser._id, { freeAccessUntil: expiresAt });
      return { success: true, expiresAt, userName: existingUser.name ?? normalizedEmail, isNew: false };
    }

    // User doesn't exist yet — create a placeholder user record with freeAccessUntil
    // When they sign up and the email matches, they'll inherit this access
    const newUserId = await ctx.db.insert("users", {
      tokenIdentifier: `pending_email:${normalizedEmail}`,
      name: normalizedEmail.split("@")[0],
      email: normalizedEmail,
      freeAccessUntil: expiresAt,
    });

    return { success: true, expiresAt, userName: normalizedEmail, isNew: true };
  },
});

// Update free access expiry date for a user
export const updateFreeAccess = mutation({
  args: {
    userId: v.id("users"),
    expiresAt: v.string(), // ISO 8601 date string
  },
  handler: async (ctx, args) => {
    const { user, member } = await getAuthedMember(ctx);
    if (member.role !== "owner") {
      throw new ConvexError({ message: "Only owners can update free access", code: "FORBIDDEN" });
    }
    await assertUserInOrg(ctx, user.currentOrgId!, args.userId);
    await ctx.db.patch(args.userId, { freeAccessUntil: args.expiresAt });
    return { success: true };
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await getAuthedMember(ctx);
    if (!user.currentOrgId) return [];

    // Get all org members
    const members = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();

    const users = await Promise.all(
      members.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return u ? {
          _id: u._id,
          name: u.name ?? "Unknown",
          email: u.email ?? "",
          freeAccessUntil: u.freeAccessUntil ?? null,
          commerceCustomerId: u.commerceCustomerId ?? null,
          role: m.role,
        } : null;
      })
    );

    return users.filter((u): u is NonNullable<typeof u> => u !== null);
  },
});

// ─── Stripe Status ───────────────────────────────────────────────────────────

export const getStripeStatus = query({
  args: {},
  handler: async (ctx): Promise<{ connected: boolean }> => {
    const { member } = await getAuthedMember(ctx);
    if (member.role !== "owner" && member.role !== "admin") {
      throw new ConvexError({ message: "Not authorized", code: "FORBIDDEN" });
    }
    // Check if the STRIPE_SECRET_KEY environment variable is configured
    const hasKey = !!process.env.STRIPE_SECRET_KEY;
    return { connected: hasKey };
  },
});
