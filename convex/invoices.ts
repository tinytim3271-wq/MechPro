import { action, mutation, query, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import { validateStripeWebhookEnvelope } from "./stripeWebhookValidation";
// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function customerPhoneLast4(phone: string): string {
  return phone.replace(/\D/g, "").slice(-4);
}

/** Returns true when the caller verified ownership via phone last-4. */
function verifyCustomerPhoneAccess(
  customer: Doc<"customers"> | null,
  phoneLast4: string | undefined,
): boolean {
  if (!customer?.phone) {
    return false;
  }
  const last4 = customerPhoneLast4(customer.phone);
  return !!phoneLast4 && phoneLast4 === last4;
}

async function nextInvoiceNumber(ctx: MutationCtx, orgId: Doc<"organizations">["_id"]): Promise<string> {
  const last = await ctx.db
    .query("invoices")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .first();
  if (!last) return "INV-0001";
  const match = last.invoiceNumber.match(/\d+$/);
  const num = match ? parseInt(match[0], 10) + 1 : 1;
  const candidate = `INV-${String(num).padStart(4, "0")}`;

  // Collision guard: check if the candidate already exists
  const existing = await ctx.db
    .query("invoices")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) => q.eq(q.field("invoiceNumber"), candidate))
    .first();
  if (existing) {
    // Increment until unique
    let n = num + 1;
    let next = `INV-${String(n).padStart(4, "0")}`;
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .collect();
    const existingNumbers = new Set(allInvoices.map((inv) => inv.invoiceNumber));
    while (existingNumbers.has(next)) {
      n += 1;
      next = `INV-${String(n).padStart(4, "0")}`;
    }
    return next;
  }
  return candidate;
}

async function reconcileTechPayRecord(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  paidAt: string,
): Promise<void> {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return;

  const ro = await ctx.db.get(invoice.roId);
  if (!ro?.assignedTo || ro.laborLines.length === 0) return;

  const member = await ctx.db.get(ro.assignedTo);
  if (!member) return;

  const customer = await ctx.db.get(ro.customerId);
  const vehicle = await ctx.db.get(ro.vehicleId);
  const laborLines = ro.laborLines.map((line) => ({
    description: line.description,
    laborHours: line.laborHours,
    laborRate: line.laborRate,
    amount: line.laborHours * line.laborRate,
  }));
  const record = {
    orgId: invoice.orgId,
    memberId: ro.assignedTo,
    userId: member.userId,
    roId: ro._id,
    invoiceId,
    roNumber: ro.roNumber,
    customerName: customer?.name ?? "Unknown",
    vehicleSummary: vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : "Unknown Vehicle",
    laborLines,
    totalHours: laborLines.reduce((sum, line) => sum + line.laborHours, 0),
    totalEarned: laborLines.reduce((sum, line) => sum + line.amount, 0),
    paidAt,
    employmentType: member.employmentType,
  };

  const existing = await ctx.db
    .query("techPayRecords")
    .withIndex("by_ro", (query) => query.eq("roId", ro._id))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, record);
  } else {
    await ctx.db.insert("techPayRecords", record);
  }
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getRevenueReport = query({
  args: {
    startDate: v.string(), // ISO 8601
    endDate: v.string(),   // ISO 8601
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const orgId = user.currentOrgId;

    // Fetch paid and partial invoices in date range by issuedAt
    // Use bounded reads with .take() to prevent system limit issues for large orgs
    const [paidInvoices, partialInvoices] = await Promise.all([
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "paid")).take(2000),
      ctx.db.query("invoices").withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "partial")).take(2000),
    ]);

    const allRevenue = [...paidInvoices, ...partialInvoices].filter(
      (inv) => inv.issuedAt >= args.startDate && inv.issuedAt <= args.endDate
    );

    // Group revenue by day
    const byDay: Record<string, number> = {};
    for (const inv of allRevenue) {
      const day = inv.issuedAt.slice(0, 10);
      byDay[day] = (byDay[day] ?? 0) + inv.amountPaid;
    }
    const dailyRevenue = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    // Fetch paid ROs to get top services (labor line descriptions)
    const roIds = allRevenue.map((inv) => inv.roId);
    const topServices: Record<string, { count: number; revenue: number }> = {};
    for (const roId of roIds) {
      const ro = await ctx.db.get(roId);
      if (!ro) continue;
      for (const line of ro.laborLines) {
        const key = line.description;
        if (!topServices[key]) topServices[key] = { count: 0, revenue: 0 };
        topServices[key].count += 1;
        topServices[key].revenue += line.laborHours * line.laborRate;
      }
    }

    const topServicesList = Object.entries(topServices)
      .map(([service, data]) => ({ service, count: data.count, revenue: data.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    const totalRevenue = allRevenue.reduce((s, i) => s + i.amountPaid, 0);
    const invoiceCount = allRevenue.length;

    return { totalRevenue, invoiceCount, dailyRevenue, topServicesList };
  },
});

// ─── QuickBooks Export Query ──────────────────────────────────────────────────

export const getInvoicesForExport = query({
  args: {
    startDate: v.string(), // ISO 8601 date (YYYY-MM-DD)
    endDate: v.string(),   // ISO 8601 date (YYYY-MM-DD)
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .take(5000);

    // Filter by date range (issuedAt is ISO string, compare YYYY-MM-DD)
    const startInstant = new Date(args.startDate + "T00:00:00Z").getTime();
    const endInstant = new Date(args.endDate + "T23:59:59.999Z").getTime();

    const filtered = allInvoices.filter((inv) => {
      const issued = new Date(inv.issuedAt).getTime();
      return issued >= startInstant && issued <= endInstant;
    });

    // Enrich with customer, RO (line items), and vehicle data
    const enriched = await Promise.all(
      filtered.map(async (inv) => {
        const [customer, ro] = await Promise.all([
          ctx.db.get(inv.customerId),
          ctx.db.get(inv.roId),
        ]);
        const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;
        return {
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          issuedAt: inv.issuedAt,
          dueAt: inv.dueAt,
          subtotal: inv.subtotal,
          taxAmount: inv.taxAmount,
          total: inv.total,
          amountPaid: inv.amountPaid,
          payments: inv.payments,
          customerName: customer?.name ?? "Unknown",
          customerEmail: customer?.email,
          customerPhone: customer?.phone,
          roNumber: ro?.roNumber ?? "",
          laborLines: ro?.laborLines ?? [],
          partLines: ro?.partLines ?? [],
          shopFees: ro?.shopFees ?? [],
          vehicleSummary: vehicle
            ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            : "",
        };
      })
    );

    return enriched;
  },
});

export const listInvoices = query({
  args: {
    locationId: v.optional(v.id("locations")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<{
    page: Array<{
      _id: Id<"invoices">; _creationTime: number; invoiceNumber: string; status: string;
      total: number; amountPaid: number; balance: number; issuedAt: string;
      dueAt?: string; customerId: Id<"customers">; roId: Id<"repairOrders">;
      customerName: string; roNumber: string; vehicleSummary: string;
    }>;
    isDone: boolean;
    continueCursor: string;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("invoices")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .paginate(args.paginationOpts);

    const page = await Promise.all(
      result.page.map(async (inv) => {
        const [customer, ro] = await Promise.all([
          ctx.db.get(inv.customerId),
          ctx.db.get(inv.roId),
        ]);
        const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;
        return {
          _id: inv._id,
          _creationTime: inv._creationTime,
          invoiceNumber: inv.invoiceNumber,
          status: inv.status,
          total: inv.total,
          amountPaid: inv.amountPaid,
          balance: inv.total - inv.amountPaid,
          issuedAt: inv.issuedAt,
          dueAt: inv.dueAt,
          customerId: inv.customerId,
          roId: inv.roId,
          customerName: customer?.name ?? "Unknown",
          roNumber: ro?.roNumber ?? "",
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
          locationId: ro?.locationId,
        };
      })
    );

    // Filter by location client-side (locationId lives on the RO, not the invoice)
    const filteredPage = args.locationId
      ? page.filter((inv) => inv.locationId === args.locationId)
      : page;

    // Strip locationId from final result to match return type
    const cleanPage = filteredPage.map(({ locationId: _loc, ...rest }) => rest);

    return { page: cleanPage, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const getInvoice = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return null;
    if (inv.orgId !== user.currentOrgId) return null;
    const customer = await ctx.db.get(inv.customerId);
    const ro = await ctx.db.get(inv.roId);
    const org = await ctx.db.get(inv.orgId);
    const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;
    return {
      ...inv,
      customer,
      ro,
      vehicle,
      org,
      balance: inv.total - inv.amountPaid,
    };
  },
});

// Internal query for fetching invoice data without auth — used by actions (e.g. Stripe)
export const getInvoiceInternal = internalQuery({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return null;
    const customer = await ctx.db.get(inv.customerId);
    const ro = await ctx.db.get(inv.roId);
    const org = await ctx.db.get(inv.orgId);
    const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;
    return {
      ...inv,
      customer,
      ro,
      vehicle,
      org,
      balance: inv.total - inv.amountPaid,
    };
  },
});

export const verifyInvoicePhoneAccess = internalQuery({
  args: {
    invoiceId: v.id("invoices"),
    phoneLast4: v.string(),
  },
  handler: async (ctx, args): Promise<boolean> => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return false;
    const customer = await ctx.db.get(inv.customerId);
    return verifyCustomerPhoneAccess(customer, args.phoneLast4);
  },
});

// ─── Public invoice summary (no auth required — used on /pay page) ───────────
// Returns limited info (no customer details) until verified
export const getInvoicePublicPreview = query({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return null;
    const org = await ctx.db.get(inv.orgId);
    // Only return minimal info for the verification screen
    return {
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      orgName: org?.name ?? "Shop",
      orgLogoUrl: org?.logoUrl,
      hasPhoneOnFile: !!(await ctx.db.get(inv.customerId))?.phone,
    };
  },
});

// Full public invoice data — requires last 4 of phone to verify ownership
export const getInvoicePublic = query({
  args: { invoiceId: v.id("invoices"), phoneLast4: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return null;

    const customer = await ctx.db.get(inv.customerId);

    if (!verifyCustomerPhoneAccess(customer, args.phoneLast4)) {
      return null;
    }

    const org = await ctx.db.get(inv.orgId);
    const ro = await ctx.db.get(inv.roId);
    const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;
    return {
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      total: inv.total,
      amountPaid: inv.amountPaid,
      balance: inv.total - inv.amountPaid,
      issuedAt: inv.issuedAt,
      dueAt: inv.dueAt,
      orgName: org?.name ?? "Shop",
      orgPhone: org?.phone,
      orgLogoUrl: org?.logoUrl,
      customerName: customer?.name ?? "Customer",
      vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined,
      roNumber: ro?.roNumber,
    };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createInvoiceFromRO = mutation({
  args: {
    roId: v.id("repairOrders"),
    notes: v.optional(v.string()),
    dueAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });

    const ro = await ctx.db.get(args.roId);
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    if (ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    }

    // Check if invoice already exists for this RO
    const existing = await ctx.db
      .query("invoices")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .first();
    if (existing) throw new ConvexError({ message: "Invoice already exists for this RO", code: "CONFLICT" });

    const invoiceNumber = await nextInvoiceNumber(ctx, user.currentOrgId);
    const now = new Date().toISOString();

    const invoiceId = await ctx.db.insert("invoices", {
      orgId: user.currentOrgId,
      roId: args.roId,
      customerId: ro.customerId,
      invoiceNumber,
      status: "draft",
      issuedAt: now,
      dueAt: args.dueAt,
      subtotal: ro.subtotal,
      taxAmount: ro.taxAmount,
      total: ro.totalAmount,
      amountPaid: 0,
      payments: [],
      notes: args.notes,
    });

    // Mark RO as invoiced
    await ctx.db.patch(args.roId, { status: "invoiced" });

    // ── Auto-deduct parts from inventory ──────────────────────────────────────
    for (const part of ro.partLines) {
      if (!part.partId) continue;
      // partId is stored as a string — look it up as an inventory document id
      // It may be stored as the raw Convex id string
      try {
        const inventoryPart = await ctx.db.get(part.partId as Id<"parts">);
        if (inventoryPart && inventoryPart.stockQty >= part.quantity) {
          await ctx.db.patch(inventoryPart._id, {
            stockQty: Math.max(0, inventoryPart.stockQty - part.quantity),
          });
        }
      } catch {
        // partId might not be a valid parts doc id — skip silently
      }
    }

    return invoiceId;
  },
});

export const addPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.union(v.literal("cash"), v.literal("card"), v.literal("check"), v.literal("other")),
    amount: v.number(),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    // Validate payment amount
    if (args.amount <= 0) {
      throw new ConvexError({ message: "Payment amount must be greater than zero", code: "BAD_REQUEST" });
    }
    const currentBalance = inv.total - inv.amountPaid;
    if (currentBalance <= 0) {
      throw new ConvexError({ message: "Invoice is already fully paid", code: "BAD_REQUEST" });
    }
    if (args.amount > currentBalance + 0.01) {
      throw new ConvexError({ message: `Payment amount cannot exceed the remaining balance of $${currentBalance.toFixed(2)}`, code: "BAD_REQUEST" });
    }
    // Round to 2 decimal places to avoid floating point issues
    const amount = Math.round(args.amount * 100) / 100;

    const now = new Date().toISOString();
    const newPayment = {
      method: args.method,
      amount,
      paidAt: now,
      reference: args.reference,
    };

    const newAmountPaid = inv.amountPaid + amount;
    const balance = inv.total - newAmountPaid;

    let status: "draft" | "sent" | "partial" | "paid" | "void" = inv.status;
    if (balance <= 0) {
      status = "paid";
    } else if (newAmountPaid > 0) {
      status = "partial";
    }

    await ctx.db.patch(inv._id, {
      payments: [...inv.payments, newPayment],
      amountPaid: newAmountPaid,
      status,
    });

    // ── Auto-create tech pay record when invoice becomes paid ──────────────
    if (status === "paid") {
      await reconcileTechPayRecord(ctx, args.invoiceId, now);

      // Schedule invoice email if customer has an email
      const org = await ctx.db.get(inv.orgId);
      const ro2 = await ctx.db.get(inv.roId);
      const customer2 = await ctx.db.get(inv.customerId);
      const vehicle2 = ro2 ? await ctx.db.get(ro2.vehicleId) : null;
      if (customer2?.email && ro2) {
        await ctx.scheduler.runAfter(0, internal.email.sendInvoiceEmail, {
          to: customer2.email,
          customerName: customer2.name,
          invoiceNumber: inv.invoiceNumber,
          roNumber: ro2.roNumber,
          vehicleSummary: vehicle2
            ? `${vehicle2.year} ${vehicle2.make} ${vehicle2.model}`
            : "Unknown Vehicle",
          subtotal: inv.subtotal,
          taxAmount: inv.taxAmount,
          total: inv.total,
          amountPaid: newAmountPaid,
          shopName: org?.name ?? "Shop",
          shopPhone: org?.phone,
          shopEmail: org?.email,
          laborLines: ro2.laborLines.map((l) => ({
            description: l.description,
            laborHours: l.laborHours,
            laborRate: l.laborRate,
          })),
          partLines: ro2.partLines.map((p) => ({
            description: p.description,
            quantity: p.quantity,
            unitPrice: p.unitPrice,
          })),
        });
      }
    }
  },
});

export const markSent = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.status === "draft") {
      await ctx.db.patch(args.invoiceId, { status: "sent" });
    }
  },
});

// ─── Mark Paid In Full (admin quick-action) ──────────────────────────────────
// Records the remaining balance as a single payment and marks the invoice paid

export const markPaidInFull = mutation({
  args: {
    invoiceId: v.id("invoices"),
    method: v.union(v.literal("cash"), v.literal("card"), v.literal("check"), v.literal("other")),
    reference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    if (inv.status === "paid") {
      throw new ConvexError({ message: "Invoice is already fully paid", code: "BAD_REQUEST" });
    }
    if (inv.status === "void") {
      throw new ConvexError({ message: "Cannot mark a voided invoice as paid", code: "BAD_REQUEST" });
    }

    const balance = inv.total - inv.amountPaid;
    if (balance <= 0) {
      throw new ConvexError({ message: "Invoice has no remaining balance", code: "BAD_REQUEST" });
    }

    const now = new Date().toISOString();
    const newPayment = {
      method: args.method,
      amount: Math.round(balance * 100) / 100,
      paidAt: now,
      reference: args.reference,
    };

    await ctx.db.patch(args.invoiceId, {
      payments: [...inv.payments, newPayment],
      amountPaid: inv.total,
      status: "paid" as const,
    });

    // ── Auto-create tech pay record ──────────────────────────────────────
    await reconcileTechPayRecord(ctx, args.invoiceId, now);

    // Schedule invoice email
    const org = await ctx.db.get(inv.orgId);
    const ro2 = await ctx.db.get(inv.roId);
    const customer2 = await ctx.db.get(inv.customerId);
    const vehicle2 = ro2 ? await ctx.db.get(ro2.vehicleId) : null;
    if (customer2?.email && ro2) {
      await ctx.scheduler.runAfter(0, internal.email.sendInvoiceEmail, {
        to: customer2.email,
        customerName: customer2.name,
        invoiceNumber: inv.invoiceNumber,
        roNumber: ro2.roNumber,
        vehicleSummary: vehicle2
          ? `${vehicle2.year} ${vehicle2.make} ${vehicle2.model}`
          : "Unknown Vehicle",
        subtotal: inv.subtotal,
        taxAmount: inv.taxAmount,
        total: inv.total,
        amountPaid: inv.total,
        shopName: org?.name ?? "Shop",
        shopPhone: org?.phone,
        shopEmail: org?.email,
        laborLines: ro2.laborLines.map((l) => ({
          description: l.description,
          laborHours: l.laborHours,
          laborRate: l.laborRate,
        })),
        partLines: ro2.partLines.map((p) => ({
          description: p.description,
          quantity: p.quantity,
          unitPrice: p.unitPrice,
        })),
      });
    }
  },
});

export const voidInvoice = mutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    // Require owner/admin role to void
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    if (!member || !(member.role === "owner" || member.role === "admin" || member.hasAdminAccess)) {
      throw new ConvexError({ message: "Only owners or admins can void invoices", code: "FORBIDDEN" });
    }
    await ctx.db.patch(args.invoiceId, { status: "void" });
    // Revert RO status to completed
    await ctx.db.patch(inv.roId, { status: "completed" });
  },
});

export const updateInvoiceNotes = mutation({
  args: { invoiceId: v.id("invoices"), notes: v.string() },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.invoiceId, { notes: args.notes });
  },
});

// ─── Manual email send action ────────────────────────────────────────────────

export const sendInvoiceEmailManual = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<void> => {
    const inv = await ctx.runQuery(api.invoices.getInvoice, {
      invoiceId: args.invoiceId,
    });
    if (!inv || !inv.customer?.email) {
      throw new ConvexError({
        message: "No customer email on file",
        code: "BAD_REQUEST",
      });
    }
    const ro = inv.ro;
    if (!ro) {
      throw new ConvexError({
        message: "Repair order not found",
        code: "NOT_FOUND",
      });
    }

    await ctx.runAction(internal.email.sendInvoiceEmail, {
      to: inv.customer.email,
      customerName: inv.customer.name,
      invoiceNumber: inv.invoiceNumber,
      roNumber: ro.roNumber,
      vehicleSummary: inv.vehicle
        ? `${inv.vehicle.year} ${inv.vehicle.make} ${inv.vehicle.model}`
        : "Unknown Vehicle",
      subtotal: inv.subtotal,
      taxAmount: inv.taxAmount,
      total: inv.total,
      amountPaid: inv.amountPaid,
      shopName: inv.org?.name ?? "Shop",
      shopPhone: inv.org?.phone,
      shopEmail: inv.org?.email,
      laborLines: ro.laborLines.map((l) => ({
        description: l.description,
        laborHours: l.laborHours,
        laborRate: l.laborRate,
      })),
      partLines: ro.partLines.map((p) => ({
        description: p.description,
        quantity: p.quantity,
        unitPrice: p.unitPrice,
      })),
    });
  },
});

// ─── Transactional Stripe webhook payment recording ──────────────────────────

export const recordStripeCheckoutPayment = internalMutation({
  args: {
    eventId: v.string(),
    eventCreated: v.number(),
    eventType: v.string(),
    sessionId: v.string(),
    clientReferenceId: v.string(),
    paymentStatus: v.string(),
    currency: v.string(),
    amountTotalCents: v.number(),
    invoiceId: v.string(),
    orgId: v.string(),
    expectedAmountCents: v.string(),
  },
  handler: async (ctx, args): Promise<
    { status: "processed" | "duplicate" } | { status: "rejected"; reason: string }
  > => {
    const reject = (reason: string) => ({ status: "rejected" as const, reason });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const envelopeValidation = validateStripeWebhookEnvelope(args, nowSeconds);
    if ("reason" in envelopeValidation) return reject(envelopeValidation.reason);

    const priorEvent = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
      .first();
    if (priorEvent) return { status: "duplicate" };

    const priorSession = await ctx.db
      .query("stripeWebhookEvents")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (priorSession) return { status: "duplicate" };

    const { expectedAmountCents } = envelopeValidation;

    let inv: Doc<"invoices"> | null;
    try {
      inv = await ctx.db.get(args.invoiceId as Id<"invoices">);
    } catch {
      return reject("invalid_invoice_id");
    }
    if (!inv) return reject("invoice_not_found");
    if (String(inv.orgId) !== args.orgId) return reject("shop_route_mismatch");
    if (inv.status !== "sent" && inv.status !== "partial") return reject("invoice_not_payable");
    if (inv.payments.some((payment) => payment.reference === args.sessionId)) {
      return { status: "duplicate" };
    }

    const balanceCents = Math.round((inv.total - inv.amountPaid) * 100);
    if (balanceCents !== expectedAmountCents || balanceCents !== args.amountTotalCents) {
      return reject("invoice_balance_mismatch");
    }

    const now = new Date().toISOString();
    const amount = args.amountTotalCents / 100;
    const newAmountPaid = inv.amountPaid + amount;
    const balance = inv.total - newAmountPaid;

    let status: "draft" | "sent" | "partial" | "paid" | "void" = inv.status;
    if (balance <= 0) {
      status = "paid";
    } else if (newAmountPaid > 0) {
      status = "partial";
    }

    await ctx.db.patch(inv._id, {
      payments: [
        ...inv.payments,
        { method: "card", amount, paidAt: now, reference: args.sessionId },
      ],
      amountPaid: newAmountPaid,
      status,
    });

    await ctx.db.insert("stripeWebhookEvents", {
      eventId: args.eventId,
      eventCreated: args.eventCreated,
      eventType: args.eventType,
      sessionId: args.sessionId,
      orgId: inv.orgId,
      invoiceId: inv._id,
      amountCents: args.amountTotalCents,
      processedAt: now,
    });

    // Create tech pay record if newly paid
    if (status === "paid") {
      await reconcileTechPayRecord(ctx, inv._id, now);
    }
    return { status: "processed" };
  },
});

// ─── Toggle invoice reminders ───────────────────────────────────────────────

export const toggleReminders = mutation({
  args: { invoiceId: v.id("invoices"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (inv.orgId !== user.currentOrgId) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    await ctx.db.patch(args.invoiceId, { remindersEnabled: args.enabled });
  },
});

// ─── Send a payment reminder email manually ─────────────────────────────────

export const sendReminderEmail = action({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args): Promise<void> => {
    const inv = await ctx.runQuery(api.invoices.getInvoice, { invoiceId: args.invoiceId });
    if (!inv) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });
    if (!inv.customer?.email) {
      throw new ConvexError({ message: "No customer email on file", code: "BAD_REQUEST" });
    }
    const daysOverdue = inv.dueAt
      ? Math.floor((Date.now() - new Date(inv.dueAt).getTime()) / 86400000)
      : 0;
    await ctx.runAction(internal.email.sendInvoiceReminderEmail, {
      to: inv.customer.email,
      customerName: inv.customer.name ?? "Valued Customer",
      invoiceNumber: inv.invoiceNumber,
      roNumber: inv.ro?.roNumber ?? "",
      vehicleSummary: inv.vehicle
        ? `${inv.vehicle.year} ${inv.vehicle.make} ${inv.vehicle.model}`
        : "",
      total: inv.total,
      balance: inv.balance,
      dueAt: inv.dueAt ?? "",
      daysOverdue,
      shopName: inv.org?.name ?? "MechPro",
      shopPhone: inv.org?.phone,
      shopEmail: inv.org?.email,
    });
    await ctx.runMutation(internal.invoices.recordReminderSent, { invoiceId: args.invoiceId });
  },
});

export const recordReminderSent = internalMutation({
  args: { invoiceId: v.id("invoices") },
  handler: async (ctx, args) => {
    const inv = await ctx.db.get(args.invoiceId);
    if (!inv) return;
    await ctx.db.patch(args.invoiceId, {
      lastReminderSentAt: new Date().toISOString(),
      remindersSentCount: (inv.remindersSentCount ?? 0) + 1,
    });
  },
});
