import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc } from "./_generated/dataModel.d.ts";

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

// ─── Parts Queries ────────────────────────────────────────────────────────────

export const listParts = query({
  args: { search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    if (args.search) {
      // Use the search index for text queries — returns only matching docs
      return await ctx.db
        .query("parts")
        .withSearchIndex("search_name", (q) =>
          q.search("name", args.search!).eq("orgId", user.currentOrgId!)
        )
        .take(100);
    }

    return await ctx.db
      .query("parts")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("asc")
      .take(500);
  },
});

export const getLowStockParts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    // Fetch parts in bounded pages and filter client-side.
    // Convex can't compare two fields in an index range, so we read in batches.
    const allParts = await ctx.db
      .query("parts")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .take(500);

    return allParts.filter((p) => p.stockQty <= p.lowStockThreshold);
  },
});

// ─── Parts Mutations ──────────────────────────────────────────────────────────

export const createPart = mutation({
  args: {
    sku: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    stockQty: v.number(),
    lowStockThreshold: v.number(),
    unitCost: v.number(),
    unitPrice: v.number(),
    supplier: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    return await ctx.db.insert("parts", { orgId: user.currentOrgId, ...args });
  },
});

export const updatePart = mutation({
  args: {
    partId: v.id("parts"),
    sku: v.optional(v.string()),
    partNumber: v.optional(v.string()),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    category: v.optional(v.string()),
    stockQty: v.optional(v.number()),
    lowStockThreshold: v.optional(v.number()),
    unitCost: v.optional(v.number()),
    unitPrice: v.optional(v.number()),
    supplier: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const { partId, ...fields } = args;
    const part = await ctx.db.get(partId);
    if (!part || part.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Part not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(partId, fields);
  },
});

export const deletePart = mutation({
  args: { partId: v.id("parts") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const part = await ctx.db.get(args.partId);
    if (!part || part.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Part not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.partId);
  },
});

export const adjustStock = mutation({
  args: { partId: v.id("parts"), delta: v.number() },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const part = await ctx.db.get(args.partId);
    if (!part || part.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Part not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.partId, { stockQty: Math.max(0, part.stockQty + args.delta) });
  },
});

/** Check available stock for a set of parts — used for pre-save warnings */
export const checkStock = query({
  args: { partIds: v.array(v.id("parts")) },
  handler: async (ctx, args): Promise<Array<{ _id: string; name: string; stockQty: number }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const results: Array<{ _id: string; name: string; stockQty: number }> = [];
    for (const partId of args.partIds) {
      const part = await ctx.db.get(partId);
      if (part) {
        results.push({ _id: part._id, name: part.name, stockQty: part.stockQty });
      }
    }
    return results;
  },
});

// ─── Supplier Queries ─────────────────────────────────────────────────────────

export const listSuppliers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    return await ctx.db
      .query("suppliers")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();
  },
});

// ─── Supplier Mutations ───────────────────────────────────────────────────────

export const createSupplier = mutation({
  args: {
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    return await ctx.db.insert("suppliers", {
      orgId: user.currentOrgId,
      isActive: true,
      ...args,
    });
  },
});

export const updateSupplier = mutation({
  args: {
    supplierId: v.id("suppliers"),
    name: v.optional(v.string()),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    website: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const { supplierId, ...fields } = args;
    const supplier = await ctx.db.get(supplierId);
    if (!supplier || supplier.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Supplier not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(supplierId, fields);
  },
});

export const deleteSupplier = mutation({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const supplier = await ctx.db.get(args.supplierId);
    if (!supplier || supplier.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Supplier not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.supplierId);
  },
});

// ─── Purchase Order Queries ───────────────────────────────────────────────────

export const listPurchaseOrders = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const pos = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(200);

    const filtered = args.status ? pos.filter((p) => p.status === args.status) : pos;

    return await Promise.all(
      filtered.map(async (po) => {
        const supplier = await ctx.db.get(po.supplierId);
        return { ...po, supplierName: supplier?.name ?? "Unknown" };
      })
    );
  },
});

export const getPurchaseOrder = query({
  args: { poId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const po = await ctx.db.get(args.poId);
    if (!po || po.orgId !== user.currentOrgId) return null;
    const supplier = await ctx.db.get(po.supplierId);
    return { ...po, supplier };
  },
});

// ─── Purchase Order Mutations ─────────────────────────────────────────────────

async function nextPONumber(ctx: MutationCtx, orgId: Doc<"organizations">["_id"]): Promise<string> {
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

const poLineValidator = v.object({
  partId: v.optional(v.string()),
  partNumber: v.optional(v.string()),
  description: v.string(),
  qtyOrdered: v.number(),
  qtyReceived: v.number(),
  unitCost: v.number(),
});

export const createPurchaseOrder = mutation({
  args: {
    supplierId: v.id("suppliers"),
    lines: v.array(poLineValidator),
    notes: v.optional(v.string()),
    expectedAt: v.optional(v.string()),
    aiGenerated: v.optional(v.boolean()),
    aiReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const poNumber = await nextPONumber(ctx, user.currentOrgId);
    const subtotal = args.lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0);
    return await ctx.db.insert("purchaseOrders", {
      orgId: user.currentOrgId,
      poNumber,
      supplierId: args.supplierId,
      status: "draft",
      lines: args.lines,
      subtotal,
      notes: args.notes,
      expectedAt: args.expectedAt,
      aiGenerated: args.aiGenerated,
      aiReason: args.aiReason,
      createdBy: user._id,
    });
  },
});

export const updatePurchaseOrderStatus = mutation({
  args: {
    poId: v.id("purchaseOrders"),
    status: v.union(
      v.literal("draft"),
      v.literal("sent"),
      v.literal("partial"),
      v.literal("received"),
      v.literal("cancelled")
    ),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const po = await ctx.db.get(args.poId);
    if (!po || po.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });
    }
    const updates: {
      status: typeof args.status;
      orderedAt?: string;
      receivedAt?: string;
    } = { status: args.status };
    if (args.status === "sent") updates.orderedAt = new Date().toISOString();
    if (args.status === "received") updates.receivedAt = new Date().toISOString();
    await ctx.db.patch(args.poId, updates);
  },
});

export const receivePurchaseOrder = mutation({
  args: {
    poId: v.id("purchaseOrders"),
    lines: v.array(poLineValidator),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const po = await ctx.db.get(args.poId);
    if (!po || po.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });
    }

    // Update stock for each line that has a partId
    for (const line of args.lines) {
      if (line.partId) {
        const part = await ctx.db.get(line.partId as Doc<"parts">["_id"]);
        if (part) {
          const received = line.qtyReceived - (po.lines.find((l) => l.partId === line.partId)?.qtyReceived ?? 0);
          if (received > 0) {
            await ctx.db.patch(part._id, { stockQty: part.stockQty + received });
          }
        }
      }
    }

    const allReceived = args.lines.every((l) => l.qtyReceived >= l.qtyOrdered);
    await ctx.db.patch(args.poId, {
      lines: args.lines,
      status: allReceived ? "received" : "partial",
      receivedAt: allReceived ? new Date().toISOString() : undefined,
    });
  },
});

export const deletePurchaseOrder = mutation({
  args: { poId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const po = await ctx.db.get(args.poId);
    if (!po || po.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.poId);
  },
});

export const updatePurchaseOrder = mutation({
  args: {
    poId: v.id("purchaseOrders"),
    supplierId: v.optional(v.id("suppliers")),
    lines: v.optional(v.array(poLineValidator)),
    notes: v.optional(v.string()),
    expectedAt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const { poId, lines, ...rest } = args;
    const po = await ctx.db.get(poId);
    if (!po || po.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Purchase order not found", code: "NOT_FOUND" });
    }
    const subtotal = lines
      ? lines.reduce((s, l) => s + l.qtyOrdered * l.unitCost, 0)
      : undefined;
    await ctx.db.patch(poId, {
      ...rest,
      ...(lines !== undefined ? { lines, subtotal } : {}),
    });
  },
});
