import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Find a vehicle by VIN and return linked customer info.
 * Used by the Vehicle Lookup page to show whether a VIN is already in the system.
 */
export const findByVin = query({
  args: { vin: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;

    const vin = args.vin.trim().toUpperCase();
    if (!vin) return null;

    // Look up vehicle by VIN within the user's org
    const vehicle = await ctx.db
      .query("vehicles")
      .withIndex("by_vin", (q) => q.eq("vin", vin))
      .first();

    if (!vehicle || vehicle.orgId !== user.currentOrgId) return null;

    // Get linked customer
    const customer = await ctx.db.get(vehicle.customerId);

    // Count repair orders for this vehicle
    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", vehicle._id))
      .take(100);

    return {
      vehicleId: vehicle._id,
      customerId: vehicle.customerId,
      customerName: customer?.name ?? "Unknown",
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      trim: vehicle.trim,
      vin: vehicle.vin,
      licensePlate: vehicle.licensePlate,
      roCount: ros.length,
    };
  },
});

export const listOrgVehicles = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(200);
    return await Promise.all(
      vehicles.map(async (v) => {
        const customer = await ctx.db.get(v.customerId);
        return {
          ...v,
          customerName: customer?.name ?? "Unknown",
        };
      }),
    );
  },
});
