import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";

// ─── Customers ────────────────────────────────────────────────────────────────

export const listCustomers = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { page: [], isDone: true, continueCursor: "" };
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return { page: [], isDone: true, continueCursor: "" };
    return await ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .paginate(args.paginationOpts);
  },
});

export const getCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.orgId !== user.currentOrgId) return null;
    return customer;
  },
});

export const createCustomer = mutation({
  args: {
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
    smsOptOut: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    return await ctx.db.insert("customers", {
      orgId: user.currentOrgId,
      ...args,
    });
  },
});

export const updateCustomer = mutation({
  args: {
    customerId: v.id("customers"),
    name: v.string(),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    notes: v.optional(v.string()),
    source: v.optional(v.string()),
    smsOptOut: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }
    const { customerId, ...fields } = args;
    await ctx.db.patch(customerId, fields);
  },
});

export const deleteCustomer = mutation({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });
    }
    // Delete all vehicles for this customer
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    for (const v of vehicles) {
      await ctx.db.delete(v._id);
    }
    await ctx.db.delete(args.customerId);
  },
});

// Return all customers for org (for dropdown search — bounded to 200 max)
export const listAllCustomers = query({
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
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .take(200);
  },
});

// ─── Vehicles ─────────────────────────────────────────────────────────────────

export const listVehicles = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    // Verify customer belongs to user's org
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.orgId !== user.currentOrgId) return [];
    return await ctx.db
      .query("vehicles")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
  },
});

export const createVehicle = mutation({
  args: {
    customerId: v.id("customers"),
    year: v.string(),
    make: v.string(),
    model: v.string(),
    trim: v.optional(v.string()),
    vin: v.optional(v.string()),
    licensePlate: v.optional(v.string()),
    color: v.optional(v.string()),
    mileageIn: v.optional(v.number()),
    engine: v.optional(v.string()),
    transmission: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    return await ctx.db.insert("vehicles", {
      orgId: user.currentOrgId,
      ...args,
    });
  },
});

export const updateVehicle = mutation({
  args: {
    vehicleId: v.id("vehicles"),
    year: v.string(),
    make: v.string(),
    model: v.string(),
    trim: v.optional(v.string()),
    vin: v.optional(v.string()),
    licensePlate: v.optional(v.string()),
    color: v.optional(v.string()),
    mileageIn: v.optional(v.number()),
    engine: v.optional(v.string()),
    transmission: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || vehicle.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });
    }
    const { vehicleId, ...fields } = args;
    await ctx.db.patch(vehicleId, fields);
  },
});

export const deleteVehicle = mutation({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || vehicle.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.vehicleId);
  },
});

export const getVehicleServiceHistory = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    const vehicle = await ctx.db.get(args.vehicleId);
    if (!vehicle || vehicle.orgId !== user.currentOrgId) return [];
    return await ctx.db
      .query("repairOrders")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
      .order("desc")
      .take(50);
  },
});

export const getCustomerHistory = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { ros: [], invoices: [], totalSpend: 0 };
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return { ros: [], invoices: [], totalSpend: 0 };
    const customer = await ctx.db.get(args.customerId);
    if (!customer || customer.orgId !== user.currentOrgId) return { ros: [], invoices: [], totalSpend: 0 };
    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(100);
    const invoiceResults = (await Promise.all(
      ros.map((ro) =>
        ctx.db
          .query("invoices")
          .withIndex("by_ro", (q) => q.eq("roId", ro._id))
          .first()
      )
    )).filter((inv): inv is NonNullable<typeof inv> => inv !== null);
    const totalSpend = invoiceResults.reduce((s, inv) => s + inv.amountPaid, 0);
    return { ros, invoices: invoiceResults, totalSpend };
  },
});
