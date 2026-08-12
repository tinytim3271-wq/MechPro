import { query, mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc } from "./_generated/dataModel.d.ts";

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

// ─── Duplicate Detection Queries ──────────────────────────────────────────────

/**
 * Finds duplicate customers based on matching name, phone, or email.
 * Returns groups of potential duplicates.
 */
export const findDuplicateCustomers = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();

    // Group by normalized name, phone, and email
    const groups: Map<string, Doc<"customers">[]> = new Map();

    for (const c of customers) {
      const keys: string[] = [];

      // Match by normalized name (lowercase, trimmed)
      const normName = c.name.toLowerCase().trim();
      if (normName) keys.push(`name:${normName}`);

      // Match by phone (digits only)
      if (c.phone) {
        const normPhone = c.phone.replace(/\D/g, "");
        if (normPhone.length >= 7) keys.push(`phone:${normPhone.slice(-10)}`);
      }

      // Match by email (lowercase)
      if (c.email) {
        const normEmail = c.email.toLowerCase().trim();
        if (normEmail) keys.push(`email:${normEmail}`);
      }

      for (const key of keys) {
        const group = groups.get(key) ?? [];
        group.push(c);
        groups.set(key, group);
      }
    }

    // Collect groups with 2+ records (actual duplicates)
    const seen = new Set<string>();
    const duplicateGroups: Array<{
      matchKey: string;
      matchType: string;
      records: Array<{ _id: string; name: string; phone?: string; email?: string; _creationTime: number }>;
    }> = [];

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      // Deduplicate groups by their sorted IDs to prevent showing same set multiple times
      const idKey = group.map((r) => r._id).sort().join(",");
      if (seen.has(idKey)) continue;
      seen.add(idKey);

      const matchType = key.split(":")[0];
      duplicateGroups.push({
        matchKey: key,
        matchType,
        records: group.map((r) => ({
          _id: r._id,
          name: r.name,
          phone: r.phone,
          email: r.email,
          _creationTime: r._creationTime,
        })),
      });
    }

    return duplicateGroups;
  },
});

/**
 * Finds duplicate vehicles based on VIN or matching year/make/model.
 */
export const findDuplicateVehicles = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();

    const groups: Map<string, Doc<"vehicles">[]> = new Map();

    for (const v of vehicles) {
      const keys: string[] = [];

      // Match by VIN (strongest match)
      if (v.vin) {
        const normVin = v.vin.toUpperCase().trim();
        if (normVin.length >= 5) keys.push(`vin:${normVin}`);
      }

      // Match by year/make/model + customer
      const ymm = `${v.year}|${v.make.toLowerCase().trim()}|${v.model.toLowerCase().trim()}|${v.customerId}`;
      keys.push(`ymm:${ymm}`);

      for (const key of keys) {
        const group = groups.get(key) ?? [];
        group.push(v);
        groups.set(key, group);
      }
    }

    const seen = new Set<string>();
    const duplicateGroups: Array<{
      matchKey: string;
      matchType: string;
      records: Array<{
        _id: string;
        year: string;
        make: string;
        model: string;
        vin?: string;
        licensePlate?: string;
        customerName?: string;
        _creationTime: number;
      }>;
    }> = [];

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const idKey = group.map((r) => r._id).sort().join(",");
      if (seen.has(idKey)) continue;
      seen.add(idKey);

      const matchType = key.split(":")[0];

      // Enrich with customer name
      const enriched = await Promise.all(
        group.map(async (v) => {
          const customer = await ctx.db.get(v.customerId);
          return {
            _id: v._id,
            year: v.year,
            make: v.make,
            model: v.model,
            vin: v.vin,
            licensePlate: v.licensePlate,
            customerName: customer?.name,
            _creationTime: v._creationTime,
          };
        })
      );

      duplicateGroups.push({ matchKey: key, matchType, records: enriched });
    }

    return duplicateGroups;
  },
});

/**
 * Finds duplicate parts based on part number or name.
 */
export const findDuplicateParts = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) return [];

    const parts = await ctx.db
      .query("parts")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();

    const groups: Map<string, Doc<"parts">[]> = new Map();

    for (const p of parts) {
      const keys: string[] = [];

      // Match by part number
      if (p.partNumber) {
        const norm = p.partNumber.toLowerCase().trim();
        if (norm) keys.push(`partnum:${norm}`);
      }

      // Match by name (exact normalized)
      const normName = p.name.toLowerCase().trim();
      if (normName) keys.push(`name:${normName}`);

      for (const key of keys) {
        const group = groups.get(key) ?? [];
        group.push(p);
        groups.set(key, group);
      }
    }

    const seen = new Set<string>();
    const duplicateGroups: Array<{
      matchKey: string;
      matchType: string;
      records: Array<{
        _id: string;
        name: string;
        partNumber?: string;
        sku?: string;
        stockQty: number;
        unitCost: number;
        unitPrice: number;
        _creationTime: number;
      }>;
    }> = [];

    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const idKey = group.map((r) => r._id).sort().join(",");
      if (seen.has(idKey)) continue;
      seen.add(idKey);

      const matchType = key.split(":")[0];
      duplicateGroups.push({
        matchKey: key,
        matchType,
        records: group.map((r) => ({
          _id: r._id,
          name: r.name,
          partNumber: r.partNumber,
          sku: r.sku,
          stockQty: r.stockQty,
          unitCost: r.unitCost,
          unitPrice: r.unitPrice,
          _creationTime: r._creationTime,
        })),
      });
    }

    return duplicateGroups;
  },
});

// ─── Merge Mutations ──────────────────────────────────────────────────────────

/**
 * Merges duplicate customers. Keeps `keepId`, reassigns all references from
 * `mergeId` to `keepId`, then deletes `mergeId`.
 */
export const mergeCustomers = mutation({
  args: {
    keepId: v.id("customers"),
    mergeId: v.id("customers"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });

    if (args.keepId === args.mergeId) {
      throw new ConvexError({ message: "Cannot merge a record with itself", code: "BAD_REQUEST" });
    }

    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge) throw new ConvexError({ message: "Customer not found", code: "NOT_FOUND" });

    // Reassign vehicles from merge → keep
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_customer", (q) => q.eq("customerId", args.mergeId))
      .collect();
    for (const v of vehicles) {
      await ctx.db.patch(v._id, { customerId: args.keepId });
    }

    // Reassign repair orders
    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.mergeId))
      .collect();
    for (const ro of ros) {
      await ctx.db.patch(ro._id, { customerId: args.keepId });
    }

    // Reassign invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", args.mergeId))
      .collect();
    for (const inv of invoices) {
      await ctx.db.patch(inv._id, { customerId: args.keepId });
    }

    // Merge fields: fill in missing fields on keep from merge
    const updates: Record<string, string | undefined> = {};
    if (!keep.phone && merge.phone) updates.phone = merge.phone;
    if (!keep.email && merge.email) updates.email = merge.email;
    if (!keep.address && merge.address) updates.address = merge.address;
    if (!keep.city && merge.city) updates.city = merge.city;
    if (!keep.state && merge.state) updates.state = merge.state;
    if (!keep.zip && merge.zip) updates.zip = merge.zip;
    if (!keep.notes && merge.notes) updates.notes = merge.notes;
    if (!keep.source && merge.source) updates.source = merge.source;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.keepId, updates);
    }

    // Delete the merged record
    await ctx.db.delete(args.mergeId);

    return { success: true, reassigned: { vehicles: vehicles.length, ros: ros.length, invoices: invoices.length } };
  },
});

/**
 * Merges duplicate vehicles. Keeps `keepId`, reassigns ROs from
 * `mergeId` to `keepId`, then deletes `mergeId`.
 */
export const mergeVehicles = mutation({
  args: {
    keepId: v.id("vehicles"),
    mergeId: v.id("vehicles"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });

    if (args.keepId === args.mergeId) {
      throw new ConvexError({ message: "Cannot merge a record with itself", code: "BAD_REQUEST" });
    }

    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge) throw new ConvexError({ message: "Vehicle not found", code: "NOT_FOUND" });

    // Reassign repair orders
    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.mergeId))
      .collect();
    for (const ro of ros) {
      await ctx.db.patch(ro._id, { vehicleId: args.keepId });
    }

    // Merge fields: fill missing fields on keep from merge
    const updates: Record<string, string | number | undefined> = {};
    if (!keep.vin && merge.vin) updates.vin = merge.vin;
    if (!keep.licensePlate && merge.licensePlate) updates.licensePlate = merge.licensePlate;
    if (!keep.color && merge.color) updates.color = merge.color;
    if (!keep.engine && merge.engine) updates.engine = merge.engine;
    if (!keep.transmission && merge.transmission) updates.transmission = merge.transmission;
    if (!keep.trim && merge.trim) updates.trim = merge.trim;
    if (!keep.notes && merge.notes) updates.notes = merge.notes;
    if (!keep.mileageIn && merge.mileageIn) updates.mileageIn = merge.mileageIn;

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(args.keepId, updates);
    }

    // Delete merged vehicle
    await ctx.db.delete(args.mergeId);

    return { success: true, reassigned: { ros: ros.length } };
  },
});

/**
 * Merges duplicate parts. Keeps `keepId`, combines stock quantities,
 * then deletes `mergeId`.
 */
export const mergeParts = mutation({
  args: {
    keepId: v.id("parts"),
    mergeId: v.id("parts"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });

    if (args.keepId === args.mergeId) {
      throw new ConvexError({ message: "Cannot merge a record with itself", code: "BAD_REQUEST" });
    }

    const keep = await ctx.db.get(args.keepId);
    const merge = await ctx.db.get(args.mergeId);
    if (!keep || !merge) throw new ConvexError({ message: "Part not found", code: "NOT_FOUND" });

    // Combine stock
    const combinedStock = keep.stockQty + merge.stockQty;

    // Merge fields
    const updates: Record<string, string | number | undefined> = {
      stockQty: combinedStock,
    };
    if (!keep.partNumber && merge.partNumber) updates.partNumber = merge.partNumber;
    if (!keep.sku && merge.sku) updates.sku = merge.sku;
    if (!keep.description && merge.description) updates.description = merge.description;
    if (!keep.category && merge.category) updates.category = merge.category;
    if (!keep.supplier && merge.supplier) updates.supplier = merge.supplier;
    if (!keep.location && merge.location) updates.location = merge.location;

    await ctx.db.patch(args.keepId, updates);

    // Delete merged part
    await ctx.db.delete(args.mergeId);

    return { success: true, combinedStock };
  },
});
