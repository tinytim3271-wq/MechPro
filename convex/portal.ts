import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { sanitizeOrgForPublic } from "./orgSanitize";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx } from "./_generated/server.d.ts";

// ─── Customer Portal (read-only, scoped by email match) ──────────────────────

// ─── Get all portal data for authenticated user in a given org ────────────────
export const getPortalData = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args): Promise<{
    customer: Doc<"customers"> | null;
    org: Doc<"organizations"> | null;
    vehicles: Array<Doc<"vehicles">>;
    repairOrders: Array<Doc<"repairOrders"> & { vehicleSummary: string }>;
    invoices: Array<Doc<"invoices"> & { balance: number; vehicleSummary: string; roNumber: string }>;
    totalOwed: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    const empty = { customer: null, org: null, vehicles: [], repairOrders: [], invoices: [], totalOwed: 0 };
    if (!identity?.email) return empty;

    const email = identity.email.toLowerCase();
    const org = await ctx.db.get(args.orgId);
    if (!org) return empty;

    const customer = await findCustomerByEmail(ctx, args.orgId, email);
    if (!customer) return { ...empty, org: sanitizeOrgForPublic(org) };

    const vehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .collect();

    const vehicleMap = new Map<string, Doc<"vehicles">>(vehicles.map((v) => [v._id.toString(), v]));

    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .take(100);

    const repairOrders = ros.map((ro) => {
      const veh = vehicleMap.get(ro.vehicleId.toString());
      return { ...ro, vehicleSummary: veh ? `${veh.year} ${veh.make} ${veh.model}` : "Unknown Vehicle" };
    });

    const rawInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_customer", (q) => q.eq("customerId", customer._id))
      .order("desc")
      .take(100);

    const invoices = await Promise.all(
      rawInvoices.map(async (inv) => {
        const ro = await ctx.db.get(inv.roId);
        const veh = ro ? vehicleMap.get(ro.vehicleId.toString()) : null;
        return {
          ...inv,
          balance: inv.total - inv.amountPaid,
          vehicleSummary: veh ? `${veh.year} ${veh.make} ${veh.model}` : "Unknown Vehicle",
          roNumber: ro?.roNumber ?? "",
        };
      })
    );

    const totalOwed = invoices
      .filter((inv) => inv.status !== "paid" && inv.status !== "void")
      .reduce((s, inv) => s + inv.balance, 0);

    return { customer, org: sanitizeOrgForPublic(org), vehicles, repairOrders, invoices, totalOwed };
  },
});

// ─── Get single invoice detail (verifies email ownership) ────────────────────
export const getPortalInvoice = query({
  args: { invoiceId: v.id("invoices"), orgId: v.id("organizations") },
  handler: async (ctx, args): Promise<(Doc<"invoices"> & {
    balance: number;
    roNumber: string;
    vehicleSummary: string;
    customer: Doc<"customers"> | null;
    org: Doc<"organizations"> | null;
    laborLines: Doc<"repairOrders">["laborLines"];
    partLines: Doc<"repairOrders">["partLines"];
    shopFees: Doc<"repairOrders">["shopFees"];
  }) | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return null;

    const inv = await ctx.db.get(args.invoiceId);
    if (!inv || inv.orgId.toString() !== args.orgId.toString()) return null;

    const email = identity.email.toLowerCase();
    const customer = await ctx.db.get(inv.customerId);
    if (!customer || (customer.email ?? "").toLowerCase() !== email) return null;

    const ro = await ctx.db.get(inv.roId);
    const org = await ctx.db.get(inv.orgId);
    const vehicle = ro ? await ctx.db.get(ro.vehicleId) : null;

    return {
      ...inv,
      balance: inv.total - inv.amountPaid,
      roNumber: ro?.roNumber ?? "",
      vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Unknown Vehicle",
      customer,
      org: org ? sanitizeOrgForPublic(org) : null,
      laborLines: ro?.laborLines ?? [],
      partLines: ro?.partLines ?? [],
      shopFees: ro?.shopFees ?? [],
    };
  },
});

// ─── Find all orgs where the logged-in user's email matches a customer ────────
export const findMyPortalOrgs = query({
  args: {},
  handler: async (ctx): Promise<Array<{ orgId: Id<"organizations">; orgName: string; customerName: string }>> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.email) return [];

    const email = identity.email.toLowerCase();

    // Search customers directly by email (much faster than scanning all orgs)
    const allCustomers = await ctx.db
      .query("customers")
      .withSearchIndex("search_email", (q) => q.search("email", email))
      .take(50);

    // Filter for exact case-insensitive email match
    const matchingCustomers = allCustomers.filter(
      (c) => (c.email ?? "").toLowerCase() === email
    );

    const results: Array<{ orgId: Id<"organizations">; orgName: string; customerName: string }> = [];
    const seenOrgs = new Set<string>();

    for (const customer of matchingCustomers) {
      if (seenOrgs.has(customer.orgId.toString())) continue;
      seenOrgs.add(customer.orgId.toString());
      const org = await ctx.db.get(customer.orgId);
      if (org && org.isActive) {
        results.push({ orgId: org._id, orgName: org.name, customerName: customer.name });
      }
    }

    return results;
  },
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function findCustomerByEmail(
  ctx: QueryCtx,
  orgId: Id<"organizations">,
  email: string
): Promise<Doc<"customers"> | null> {
  const matches = await ctx.db
    .query("customers")
    .withSearchIndex("search_email", (q) => q.search("email", email).eq("orgId", orgId))
    .take(20);

  return matches.find((c) => (c.email ?? "").toLowerCase() === email) ?? null;
}

// Suppress unused import warning
void ConvexError;
