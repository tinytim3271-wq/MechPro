import { internalMutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getAuthedUser(ctx: MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user) throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
  return user;
}

async function nextRONumber(ctx: MutationCtx, orgId: Id<"organizations">): Promise<string> {
  const last = await ctx.db
    .query("repairOrders")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .first();
  if (!last) return "RO-0001";
  const match = last.roNumber.match(/\d+$/);
  const num = match ? parseInt(match[0], 10) + 1 : 1;
  return `RO-${String(num).padStart(4, "0")}`;
}

async function nextInvoiceNumber(ctx: MutationCtx, orgId: Id<"organizations">): Promise<string> {
  const last = await ctx.db
    .query("invoices")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .first();
  if (!last) return "INV-0001";
  const match = last.invoiceNumber.match(/\d+$/);
  const num = match ? parseInt(match[0], 10) + 1 : 1;
  return `INV-${String(num).padStart(4, "0")}`;
}

async function nextPONumber(ctx: MutationCtx, orgId: Id<"organizations">): Promise<string> {
  const last = await ctx.db
    .query("purchaseOrders")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .order("desc")
    .first();
  if (!last) return "PO-0001";
  const match = last.poNumber.match(/\d+$/);
  const num = match ? parseInt(match[0], 10) + 1 : 1;
  return `PO-${String(num).padStart(4, "0")}`;
}

// Find or create a customer by name for the current org
async function findOrCreateCustomer(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  name: string,
  phone?: string,
  email?: string
): Promise<Id<"customers">> {
  const existing = await ctx.db
    .query("customers")
    .withIndex("by_org_name", (q) => q.eq("orgId", orgId).eq("name", name))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("customers", {
    orgId,
    name,
    phone,
    email,
    source: "import",
  });
}

// Find or create a vehicle for a customer
async function findOrCreateVehicle(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  customerId: Id<"customers">,
  year: string,
  make: string,
  model: string,
  vin?: string,
  licensePlate?: string,
  mileage?: number
): Promise<Id<"vehicles">> {
  // Try matching by VIN first
  if (vin) {
    const byVin = await ctx.db
      .query("vehicles")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.eq(q.field("vin"), vin))
      .first();
    if (byVin) return byVin._id;
  }
  // Try matching by year/make/model for same customer
  const byYmm = await ctx.db
    .query("vehicles")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .filter((q) =>
      q.and(
        q.eq(q.field("customerId"), customerId),
        q.eq(q.field("year"), year),
        q.eq(q.field("make"), make),
        q.eq(q.field("model"), model)
      )
    )
    .first();
  if (byYmm) return byYmm._id;

  return await ctx.db.insert("vehicles", {
    orgId,
    customerId,
    year,
    make,
    model,
    vin,
    licensePlate,
    mileageIn: mileage,
  });
}

// Find or create a supplier
async function findOrCreateSupplier(
  ctx: MutationCtx,
  orgId: Id<"organizations">,
  name: string
): Promise<Id<"suppliers">> {
  const existing = await ctx.db
    .query("suppliers")
    .withIndex("by_org_name", (q) => q.eq("orgId", orgId).eq("name", name))
    .first();
  if (existing) return existing._id;
  return await ctx.db.insert("suppliers", {
    orgId,
    name,
    isActive: true,
  });
}

// ─── Import Work Order (single row) ──────────────────────────────────────────

export const importWorkOrder = internalMutation({
  args: {
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleYear: v.string(),
    vehicleMake: v.string(),
    vehicleModel: v.string(),
    vin: v.optional(v.string()),
    licensePlate: v.optional(v.string()),
    mileage: v.optional(v.number()),
    complaint: v.string(),
    cause: v.optional(v.string()),
    correction: v.optional(v.string()),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    laborDescription: v.optional(v.string()),
    laborHours: v.optional(v.number()),
    laborRate: v.optional(v.number()),
    partDescription: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    partQty: v.optional(v.number()),
    partCost: v.optional(v.number()),
    partPrice: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const orgId = user.currentOrgId;

    const customerId = await findOrCreateCustomer(ctx, orgId, args.customerName, args.customerPhone, args.customerEmail);
    const vehicleId = await findOrCreateVehicle(
      ctx, orgId, customerId,
      args.vehicleYear, args.vehicleMake, args.vehicleModel,
      args.vin, args.licensePlate, args.mileage
    );

    const roNumber = await nextRONumber(ctx, orgId);

    // Build labor lines
    const laborLines: Array<{ description: string; laborHours: number; laborRate: number }> = [];
    if (args.laborDescription) {
      laborLines.push({
        description: args.laborDescription,
        laborHours: args.laborHours ?? 1,
        laborRate: args.laborRate ?? 0,
      });
    }

    // Build part lines
    const partLines: Array<{ description: string; partNumber?: string; quantity: number; unitCost: number; unitPrice: number }> = [];
    if (args.partDescription) {
      partLines.push({
        description: args.partDescription,
        partNumber: args.partNumber,
        quantity: args.partQty ?? 1,
        unitCost: args.partCost ?? 0,
        unitPrice: args.partPrice ?? 0,
      });
    }

    // Calculate totals
    const laborTotal = laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0);
    const partsTotal = partLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const subtotal = args.totalAmount ?? (laborTotal + partsTotal);

    // Map status
    const validStatuses = ["estimate", "approved", "in_progress", "waiting_parts", "completed", "invoiced", "cancelled"] as const;
    type ROStatus = typeof validStatuses[number];
    const statusLower = (args.status ?? "completed").toLowerCase().replace(/[\s-]+/g, "_");
    const status: ROStatus = validStatuses.includes(statusLower as ROStatus) ? (statusLower as ROStatus) : "completed";

    const validPriorities = ["low", "normal", "high"] as const;
    type Priority = typeof validPriorities[number];
    const priorityLower = (args.priority ?? "normal").toLowerCase();
    const priority: Priority = validPriorities.includes(priorityLower as Priority) ? (priorityLower as Priority) : "normal";

    await ctx.db.insert("repairOrders", {
      orgId,
      roNumber,
      customerId,
      vehicleId,
      isMobile: false,
      complaint: args.complaint,
      cause: args.cause,
      correction: args.correction,
      status,
      priority,
      mileageIn: args.mileage,
      laborLines,
      partLines,
      shopFees: [],
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      internalNotes: args.notes,
    });
  },
});

// ─── Import Estimate (same as work order but status = "estimate") ─────────────

export const importEstimate = internalMutation({
  args: {
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleYear: v.string(),
    vehicleMake: v.string(),
    vehicleModel: v.string(),
    vin: v.optional(v.string()),
    licensePlate: v.optional(v.string()),
    mileage: v.optional(v.number()),
    complaint: v.string(),
    laborDescription: v.optional(v.string()),
    laborHours: v.optional(v.number()),
    laborRate: v.optional(v.number()),
    partDescription: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    partQty: v.optional(v.number()),
    partCost: v.optional(v.number()),
    partPrice: v.optional(v.number()),
    totalAmount: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const orgId = user.currentOrgId;

    const customerId = await findOrCreateCustomer(ctx, orgId, args.customerName, args.customerPhone, args.customerEmail);
    const vehicleId = await findOrCreateVehicle(
      ctx, orgId, customerId,
      args.vehicleYear, args.vehicleMake, args.vehicleModel,
      args.vin, args.licensePlate, args.mileage
    );

    const roNumber = await nextRONumber(ctx, orgId);

    const laborLines: Array<{ description: string; laborHours: number; laborRate: number }> = [];
    if (args.laborDescription) {
      laborLines.push({
        description: args.laborDescription,
        laborHours: args.laborHours ?? 1,
        laborRate: args.laborRate ?? 0,
      });
    }

    const partLines: Array<{ description: string; partNumber?: string; quantity: number; unitCost: number; unitPrice: number }> = [];
    if (args.partDescription) {
      partLines.push({
        description: args.partDescription,
        partNumber: args.partNumber,
        quantity: args.partQty ?? 1,
        unitCost: args.partCost ?? 0,
        unitPrice: args.partPrice ?? 0,
      });
    }

    const laborTotal = laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0);
    const partsTotal = partLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    const subtotal = args.totalAmount ?? (laborTotal + partsTotal);

    await ctx.db.insert("repairOrders", {
      orgId,
      roNumber,
      customerId,
      vehicleId,
      isMobile: false,
      complaint: args.complaint,
      status: "estimate",
      priority: "normal",
      laborLines,
      partLines,
      shopFees: [],
      subtotal,
      taxAmount: 0,
      totalAmount: subtotal,
      internalNotes: args.notes,
    });
  },
});

// ─── Import Invoice ───────────────────────────────────────────────────────────

export const importInvoice = internalMutation({
  args: {
    customerName: v.string(),
    customerPhone: v.optional(v.string()),
    customerEmail: v.optional(v.string()),
    vehicleYear: v.string(),
    vehicleMake: v.string(),
    vehicleModel: v.string(),
    vin: v.optional(v.string()),
    complaint: v.string(),
    invoiceNumber: v.optional(v.string()),
    status: v.optional(v.string()),
    subtotal: v.number(),
    taxAmount: v.optional(v.number()),
    total: v.number(),
    amountPaid: v.optional(v.number()),
    issuedAt: v.optional(v.string()),
    dueAt: v.optional(v.string()),
    notes: v.optional(v.string()),
    laborDescription: v.optional(v.string()),
    laborHours: v.optional(v.number()),
    laborRate: v.optional(v.number()),
    partDescription: v.optional(v.string()),
    partQty: v.optional(v.number()),
    partPrice: v.optional(v.number()),
    partCost: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const orgId = user.currentOrgId;

    const customerId = await findOrCreateCustomer(ctx, orgId, args.customerName, args.customerPhone, args.customerEmail);
    const vehicleId = await findOrCreateVehicle(
      ctx, orgId, customerId,
      args.vehicleYear, args.vehicleMake, args.vehicleModel,
      args.vin
    );

    // Create a backing RO for this invoice (invoices require an roId)
    const roNumber = await nextRONumber(ctx, orgId);
    const laborLines: Array<{ description: string; laborHours: number; laborRate: number }> = [];
    if (args.laborDescription) {
      laborLines.push({
        description: args.laborDescription,
        laborHours: args.laborHours ?? 1,
        laborRate: args.laborRate ?? 0,
      });
    }
    const partLines: Array<{ description: string; partNumber?: string; quantity: number; unitCost: number; unitPrice: number }> = [];
    if (args.partDescription) {
      partLines.push({
        description: args.partDescription,
        quantity: args.partQty ?? 1,
        unitCost: args.partCost ?? 0,
        unitPrice: args.partPrice ?? 0,
      });
    }

    const roId = await ctx.db.insert("repairOrders", {
      orgId,
      roNumber,
      customerId,
      vehicleId,
      isMobile: false,
      complaint: args.complaint || "Imported invoice",
      status: "invoiced",
      priority: "normal",
      laborLines,
      partLines,
      shopFees: [],
      subtotal: args.subtotal,
      taxAmount: args.taxAmount ?? 0,
      totalAmount: args.total,
    });

    // Map invoice status
    const validStatuses = ["draft", "sent", "partial", "paid", "void"] as const;
    type InvStatus = typeof validStatuses[number];
    const statusLower = (args.status ?? "paid").toLowerCase();
    const status: InvStatus = validStatuses.includes(statusLower as InvStatus) ? (statusLower as InvStatus) : "paid";

    const invoiceNumber = args.invoiceNumber || (await nextInvoiceNumber(ctx, orgId));
    const now = new Date().toISOString();
    const amountPaid = args.amountPaid ?? (status === "paid" ? args.total : 0);

    // Build payments array
    const payments: Array<{ method: "cash" | "card" | "check" | "other"; amount: number; paidAt: string }> = [];
    if (amountPaid > 0) {
      payments.push({ method: "other", amount: amountPaid, paidAt: args.issuedAt ?? now });
    }

    await ctx.db.insert("invoices", {
      orgId,
      roId,
      customerId,
      invoiceNumber,
      status,
      issuedAt: args.issuedAt ?? now,
      dueAt: args.dueAt,
      subtotal: args.subtotal,
      taxAmount: args.taxAmount ?? 0,
      total: args.total,
      amountPaid,
      payments,
      notes: args.notes,
    });
  },
});

// ─── Import Purchase Order ────────────────────────────────────────────────────

export const importPurchaseOrder = internalMutation({
  args: {
    supplierName: v.string(),
    status: v.optional(v.string()),
    partDescription: v.string(),
    partNumber: v.optional(v.string()),
    qtyOrdered: v.number(),
    qtyReceived: v.optional(v.number()),
    unitCost: v.number(),
    notes: v.optional(v.string()),
    orderedAt: v.optional(v.string()),
    expectedAt: v.optional(v.string()),
    receivedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const orgId = user.currentOrgId;

    const supplierId = await findOrCreateSupplier(ctx, orgId, args.supplierName);
    const poNumber = await nextPONumber(ctx, orgId);

    const qtyReceived = args.qtyReceived ?? 0;
    const subtotal = args.qtyOrdered * args.unitCost;

    const validStatuses = ["draft", "sent", "partial", "received", "cancelled"] as const;
    type POStatus = typeof validStatuses[number];
    const statusLower = (args.status ?? "received").toLowerCase();
    const status: POStatus = validStatuses.includes(statusLower as POStatus) ? (statusLower as POStatus) : "received";

    await ctx.db.insert("purchaseOrders", {
      orgId,
      poNumber,
      supplierId,
      status,
      lines: [{
        description: args.partDescription,
        partNumber: args.partNumber,
        qtyOrdered: args.qtyOrdered,
        qtyReceived,
        unitCost: args.unitCost,
      }],
      subtotal,
      notes: args.notes,
      orderedAt: args.orderedAt,
      expectedAt: args.expectedAt,
      receivedAt: args.receivedAt,
      createdBy: user._id,
    });
  },
});
