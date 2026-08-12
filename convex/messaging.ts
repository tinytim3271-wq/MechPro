import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { internal } from "./_generated/api";

// ─── Get message templates for composing SMS via device ──────────────────────

export const getMessageTemplate = query({
  args: {
    roId: v.id("repairOrders"),
    templateType: v.union(v.literal("status_update"), v.literal("estimate"), v.literal("custom")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const ro = await ctx.db.get(args.roId);
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });

    const customer = await ctx.db.get(ro.customerId);
    const vehicle = await ctx.db.get(ro.vehicleId);
    const org = await ctx.db.get(ro.orgId);

    const customerName = customer?.name ?? "Customer";
    const vehicleSummary = vehicle
      ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
      : "Your vehicle";
    const shopName = org?.name ?? "Our Shop";
    const shopPhone = org?.phone ?? "";
    const roNumber = ro.roNumber;

    let body = "";

    if (args.templateType === "status_update") {
      // Use custom template if set, otherwise default
      const customTemplate = ro.status === "in_progress"
        ? org?.smsTemplateStart
        : org?.smsTemplateComplete;

      if (customTemplate) {
        body = customTemplate
          .replace(/\{\{name\}\}/g, customerName)
          .replace(/\{\{vehicle\}\}/g, vehicleSummary)
          .replace(/\{\{roNumber\}\}/g, roNumber)
          .replace(/\{\{shopName\}\}/g, shopName)
          .replace(/\{\{shopPhone\}\}/g, shopPhone);
      } else {
        const statusMessage = getStatusMessage(ro.status);
        body = `Hi ${customerName}, update from ${shopName}:\n\n${statusMessage}\nVehicle: ${vehicleSummary}\nRO#: ${roNumber}`;
        if (shopPhone) body += `\n\nQuestions? Call us: ${shopPhone}`;
      }
    } else if (args.templateType === "estimate") {
      body = `Hi ${customerName}, your estimate from ${shopName} is ready.\n\nVehicle: ${vehicleSummary}\nRO#: ${roNumber}`;
      if (shopPhone) body += `\n\nQuestions? Call us: ${shopPhone}`;
    } else {
      body = "";
    }

    return {
      phone: customer?.phone ?? "",
      customerName,
      body,
    };
  },
});

// ─── Get customer list for quick messaging ───────────────────────────────────

export const getRecentCustomersForMessaging = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const orgId = user.currentOrgId;

    // Get recent ROs with customers
    const recentROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(50);

    // Deduplicate customers
    const seen = new Set<string>();
    const customers: Array<{
      customerId: string;
      name: string;
      phone: string;
      vehicle?: string;
      roNumber?: string;
      status?: string;
    }> = [];

    for (const ro of recentROs) {
      if (seen.has(ro.customerId)) continue;
      seen.add(ro.customerId);

      const customer = await ctx.db.get(ro.customerId);
      if (!customer?.phone) continue;

      const vehicle = await ctx.db.get(ro.vehicleId);

      customers.push({
        customerId: ro.customerId,
        name: customer.name,
        phone: customer.phone,
        vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : undefined,
        roNumber: ro.roNumber,
        status: ro.status,
      });

      if (customers.length >= 20) break;
    }

    return customers;
  },
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStatusMessage(status: string): string {
  switch (status) {
    case "estimate":
      return "Your estimate is ready for review";
    case "approved":
      return "Your repair has been approved and is scheduled";
    case "in_progress":
      return "Work has begun on your vehicle";
    case "waiting_parts":
      return "We're waiting on parts for your repair";
    case "completed":
      return "Your vehicle is ready for pickup!";
    case "invoiced":
      return "Your invoice is ready";
    default:
      return `Status update: ${status}`;
  }
}
