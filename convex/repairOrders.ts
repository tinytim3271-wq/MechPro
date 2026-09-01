import { mutation, query, action, internalMutation, internalQuery } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { api, internal } from "./_generated/api";
import { sanitizeOrgForClient } from "./orgSanitize";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";
import type { Doc, Id } from "./_generated/dataModel.d.ts";

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

async function nextRONumber(ctx: MutationCtx, orgId: Doc<"organizations">["_id"]): Promise<string> {
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

// ─── Labor / Part / Fee validators ────────────────────────────────────────────

const laborLineValidator = v.object({
  description: v.string(),
  laborHours: v.number(),
  laborRate: v.number(),
  techNotes: v.optional(v.string()),
});

const partLineValidator = v.object({
  partId: v.optional(v.string()),
  partNumber: v.optional(v.string()),
  description: v.string(),
  quantity: v.number(),
  unitCost: v.number(),
  unitPrice: v.number(),
});

const shopFeeValidator = v.object({
  description: v.string(),
  amount: v.number(),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listROs = query({
  args: {
    status: v.optional(v.union(
      v.literal("estimate"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("waiting_parts"),
      v.literal("completed"),
      v.literal("invoiced"),
      v.literal("cancelled"),
    )),
    locationId: v.optional(v.id("locations")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<{
    page: Array<{
      _id: Id<"repairOrders">; _creationTime: number; roNumber: string; status: string;
      priority: string; complaint: string; customerId: Id<"customers">; vehicleId: Id<"vehicles">;
      bayName?: string; isMobile: boolean; totalAmount: number;
      scheduledAt?: string; promisedAt?: string; assignedTo?: Id<"orgMembers">; customerName: string; vehicleSummary: string;
      locationId?: Id<"locations">;
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

    // Use status index when filtering by status, otherwise use org index
    const baseQuery = args.status
      ? ctx.db
          .query("repairOrders")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", user.currentOrgId!).eq("status", args.status!)
          )
          .order("desc")
      : ctx.db
          .query("repairOrders")
          .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
          .order("desc");

    const result = await baseQuery.paginate(args.paginationOpts);

    // Apply location filter client-side after pagination (locationId is optional/sparse)
    const filteredPage = args.locationId
      ? result.page.filter((ro) => ro.locationId === args.locationId)
      : result.page;

    const page = await Promise.all(
      filteredPage.map(async (ro) => {
        const [customer, vehicle] = await Promise.all([
          ctx.db.get(ro.customerId),
          ctx.db.get(ro.vehicleId),
        ]);
        return {
          _id: ro._id,
          _creationTime: ro._creationTime,
          roNumber: ro.roNumber,
          status: ro.status,
          priority: ro.priority,
          complaint: ro.complaint,
          customerId: ro.customerId,
          vehicleId: ro.vehicleId,
          bayName: ro.bayName,
          isMobile: ro.isMobile,
          totalAmount: ro.totalAmount,
          scheduledAt: ro.scheduledAt,
          promisedAt: ro.promisedAt,
          assignedTo: ro.assignedTo,
          locationId: ro.locationId,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle
            ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            : "Unknown Vehicle",
        };
      })
    );

    return { page, isDone: result.isDone, continueCursor: result.continueCursor };
  },
});

export const getRO = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) return null;
    const customer = await ctx.db.get(ro.customerId);
    const vehicle = await ctx.db.get(ro.vehicleId);
    const org = await ctx.db.get(ro.orgId);
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", user.currentOrgId!).eq("userId", user._id))
      .first();
    const safeOrg = org ? sanitizeOrgForClient(org, member?.role, member?.hasAdminAccess) : null;
    return {
      ...ro,
      customer,
      vehicle,
      org: safeOrg,
      laborRate: org?.laborRate ?? 100,
      taxRate: org?.taxRate ?? 0,
    };
  },
});

export const getBayBoard = query({
  args: {},
  handler: async (ctx): Promise<{
    bayNames: string[];
    assignments: Record<string, {
      _id: string; roNumber: string; customerName: string;
      vehicleSummary: string; complaint: string; status: string; priority: string;
    } | null>;
  } | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return null;
    const org = await ctx.db.get(user.currentOrgId);
    if (!org) return null;

    const activeROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("status", "in_progress")
      )
      .collect();

    const approvedROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("status", "approved")
      )
      .collect();

    const waitingROs = await ctx.db
      .query("repairOrders")
      .withIndex("by_org_status", (q) =>
        q.eq("orgId", user.currentOrgId!).eq("status", "waiting_parts")
      )
      .collect();

    const allBayROs = [...activeROs, ...approvedROs, ...waitingROs].filter(
      (r) => !r.isMobile && r.bayName
    );

    const assignments: Record<string, {
      _id: string; roNumber: string; customerName: string;
      vehicleSummary: string; complaint: string; status: string; priority: string;
    } | null> = {};

    for (const bayName of org.bayNames) {
      assignments[bayName] = null;
    }

    await Promise.all(
      allBayROs.map(async (ro) => {
        if (!ro.bayName || !(ro.bayName in assignments)) return;
        const customer = await ctx.db.get(ro.customerId);
        const vehicle = await ctx.db.get(ro.vehicleId);
        assignments[ro.bayName] = {
          _id: ro._id,
          roNumber: ro.roNumber,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "",
          complaint: ro.complaint,
          status: ro.status,
          priority: ro.priority,
        };
      })
    );

    return { bayNames: org.bayNames, assignments };
  },
});

export const listForVehicle = query({
  args: { vehicleId: v.id("vehicles") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    const rows = await ctx.db
      .query("repairOrders")
      .withIndex("by_vehicle", (q) => q.eq("vehicleId", args.vehicleId))
      .order("desc")
      .take(50);
    return rows
      .filter((ro) => ro.orgId === user.currentOrgId)
      .map((ro) => ({
        _id: ro._id,
        roNumber: ro.roNumber,
        status: ro.status,
        complaint: ro.complaint,
        authorizationName: ro.authorizationName,
        signedAt: ro.signedAt,
        customerSignature: ro.customerSignature,
        customerId: ro.customerId,
        vehicleId: ro.vehicleId,
      }));
  },
});

export const getLaborMatrix = query({
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
      .query("laborMatrix")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .collect();
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createRO = mutation({
  args: {
    customerId: v.id("customers"),
    vehicleId: v.id("vehicles"),
    isMobile: v.boolean(),
    bayName: v.optional(v.string()),
    mobileAddress: v.optional(v.string()),
    serviceAddress: v.optional(v.string()),
    serviceCity: v.optional(v.string()),
    serviceState: v.optional(v.string()),
    serviceZip: v.optional(v.string()),
    complaint: v.string(),
    priority: v.union(v.literal("low"), v.literal("normal"), v.literal("high")),
    mileageIn: v.optional(v.number()),
    scheduledAt: v.optional(v.string()),
    promisedAt: v.optional(v.string()),
    locationId: v.optional(v.id("locations")),
    assignedTo: v.optional(v.id("orgMembers")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No active org", code: "BAD_REQUEST" });
    const org = await ctx.db.get(user.currentOrgId);
    if (!org) throw new ConvexError({ message: "Org not found", code: "NOT_FOUND" });

    const roNumber = await nextRONumber(ctx, user.currentOrgId);

    const roId = await ctx.db.insert("repairOrders", {
      orgId: user.currentOrgId,
      locationId: args.locationId,
      roNumber,
      customerId: args.customerId,
      vehicleId: args.vehicleId,
      assignedTo: args.assignedTo,
      isMobile: args.isMobile,
      bayName: args.bayName,
      mobileAddress: args.mobileAddress,
      serviceAddress: args.serviceAddress,
      serviceCity: args.serviceCity,
      serviceState: args.serviceState,
      serviceZip: args.serviceZip,
      complaint: args.complaint,
      priority: args.priority,
      status: "estimate",
      mileageIn: args.mileageIn,
      scheduledAt: args.scheduledAt,
      promisedAt: args.promisedAt,
      laborLines: [],
      partLines: [],
      shopFees: [],
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      aiWorkflowStatus: "pending",
    });

    // Auto-trigger AI workflow generation
    await ctx.scheduler.runAfter(0, internal.ai.generateWorkflow, { roId });

    return roId;
  },
});

export const updateROStatus = mutation({
  args: {
    roId: v.id("repairOrders"),
    status: v.union(
      v.literal("estimate"),
      v.literal("approved"),
      v.literal("in_progress"),
      v.literal("waiting_parts"),
      v.literal("completed"),
      v.literal("invoiced"),
      v.literal("cancelled")
    ),
    bayName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    if (ro.orgId !== user.currentOrgId) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });

    const updates: {
      status: typeof args.status;
      bayName?: string;
      startedAt?: string;
      completedAt?: string;
    } = { status: args.status };
    if (args.bayName !== undefined) updates.bayName = args.bayName;
    if (args.status === "in_progress") updates.startedAt = new Date().toISOString();
    if (args.status === "completed") updates.completedAt = new Date().toISOString();
    await ctx.db.patch(args.roId, updates);

    // Restore stock when RO is cancelled (reverse all deductions for inventory-tracked parts)
    if (args.status === "cancelled" && ro.status !== "cancelled") {
      for (const line of ro.partLines) {
        if (line.partId) {
          const part = await ctx.db.get(line.partId as Id<"parts">);
          if (part) {
            await ctx.db.patch(part._id, { stockQty: part.stockQty + line.quantity });
          }
        }
      }
    }

    // Auto-email customer when job is completed (ready for pickup)
    if (args.status === "completed") {
      const customer = await ctx.db.get(ro.customerId);
      const vehicle = await ctx.db.get(ro.vehicleId);
      const org = await ctx.db.get(ro.orgId);
      if (customer?.email) {
        await ctx.scheduler.runAfter(0, internal.email.sendStatusUpdateEmail, {
          to: customer.email,
          customerName: customer.name,
          roNumber: ro.roNumber,
          vehicleSummary: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Your vehicle",
          status: "completed",
          shopName: org?.name ?? "Our Shop",
          shopPhone: org?.phone,
          shopEmail: org?.email,
        });
      }
    }
  },
});

export const updateROLines = mutation({
  args: {
    roId: v.id("repairOrders"),
    laborLines: v.array(laborLineValidator),
    partLines: v.array(partLineValidator),
    shopFees: v.array(shopFeeValidator),
    cause: v.optional(v.string()),
    correction: v.optional(v.string()),
    internalNotes: v.optional(v.string()),
    mileageOut: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    if (ro.orgId !== user.currentOrgId) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    const org = await ctx.db.get(ro.orgId);

    // ─── Auto-deduct/restore stock based on part line changes ─────────────
    // Build a map of partId → old quantity from the existing RO
    const oldQtyMap = new Map<string, number>();
    for (const line of ro.partLines) {
      if (line.partId) {
        oldQtyMap.set(line.partId, (oldQtyMap.get(line.partId) ?? 0) + line.quantity);
      }
    }

    // Build a map of partId → new quantity from the incoming part lines
    const newQtyMap = new Map<string, number>();
    for (const line of args.partLines) {
      if (line.partId) {
        newQtyMap.set(line.partId, (newQtyMap.get(line.partId) ?? 0) + line.quantity);
      }
    }

    // Calculate deltas and adjust stock for each part
    const allPartIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
    const stockWarnings: string[] = [];

    for (const partId of allPartIds) {
      const oldQty = oldQtyMap.get(partId) ?? 0;
      const newQty = newQtyMap.get(partId) ?? 0;
      const delta = newQty - oldQty; // positive = more used, negative = returned

      if (delta === 0) continue;

      const part = await ctx.db.get(partId as Id<"parts">);
      if (!part) continue;

      const updatedStock = part.stockQty - delta;

      // Allow negative stock but track warnings
      if (updatedStock < 0) {
        stockWarnings.push(part.name);
      }

      await ctx.db.patch(part._id, { stockQty: updatedStock });
    }
    // ─── End stock adjustment ─────────────────────────────────────────────

    const laborTotal = args.laborLines.reduce((s, l) => s + l.laborHours * l.laborRate, 0);
    const partsTotal = args.partLines.reduce((s, p) => s + p.quantity * p.unitPrice, 0);
    const feesTotal = args.shopFees.reduce((s, f) => s + f.amount, 0);
    const subtotal = laborTotal + partsTotal + feesTotal;
    const taxRate = (org?.taxRate ?? 0) / 100;
    const taxAmount = subtotal * taxRate;
    const totalAmount = subtotal + taxAmount;

    await ctx.db.patch(args.roId, {
      laborLines: args.laborLines,
      partLines: args.partLines,
      shopFees: args.shopFees,
      cause: args.cause,
      correction: args.correction,
      internalNotes: args.internalNotes,
      mileageOut: args.mileageOut,
      subtotal,
      taxAmount,
      totalAmount,
    });

    // Return stock warnings to the client so they can alert the user
    return { stockWarnings };
  },
});

export const updateRODetails = mutation({
  args: {
    roId: v.id("repairOrders"),
    complaint: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("low"), v.literal("normal"), v.literal("high"))),
    bayName: v.optional(v.string()),
    isMobile: v.optional(v.boolean()),
    mobileAddress: v.optional(v.string()),
    serviceAddress: v.optional(v.string()),
    serviceCity: v.optional(v.string()),
    serviceState: v.optional(v.string()),
    serviceZip: v.optional(v.string()),
    scheduledAt: v.optional(v.string()),
    promisedAt: v.optional(v.string()),
    mileageIn: v.optional(v.number()),
    authorizationName: v.optional(v.string()),
    authorizationMethod: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    }
    const { roId, ...fields } = args;
    await ctx.db.patch(roId, fields);
  },
});

export const sendROStatusEmail = action({
  args: {
    roId: v.id("repairOrders"),
    customMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const ro = await ctx.runQuery(api.repairOrders.getRO, { roId: args.roId });
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    if (!ro.customer?.email) throw new ConvexError({ message: "Customer has no email address on file", code: "BAD_REQUEST" });

    await ctx.runAction(internal.email.sendStatusUpdateEmail, {
      to: ro.customer.email,
      customerName: ro.customer.name,
      roNumber: ro.roNumber,
      vehicleSummary: ro.vehicle ? `${ro.vehicle.year} ${ro.vehicle.make} ${ro.vehicle.model}` : "Your vehicle",
      status: ro.status,
      shopName: ro.org?.name ?? "Our Shop",
      shopPhone: ro.org?.phone,
      shopEmail: ro.org?.email,
      customMessage: args.customMessage,
    });
  },
});

export const assignRO = mutation({
  args: {
    roId: v.id("repairOrders"),
    assignedTo: v.optional(v.id("orgMembers")),
  },
  handler: async (ctx, args): Promise<void> => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    if (ro.orgId !== user.currentOrgId) throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });

    const previousAssignee = ro.assignedTo;
    await ctx.db.patch(args.roId, { assignedTo: args.assignedTo });

    // Send notification to the newly assigned tech
    if (args.assignedTo && args.assignedTo !== previousAssignee) {
      const member = await ctx.db.get(args.assignedTo);
      if (!member) return;

      // Get customer and vehicle details for the notification
      const customer = await ctx.db.get(ro.customerId);
      const vehicle = await ctx.db.get(ro.vehicleId);
      const vehicleSummary = vehicle
        ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
        : "Vehicle";

      // Build the address string
      const addressParts = [ro.serviceAddress, ro.serviceCity, ro.serviceState, ro.serviceZip].filter(Boolean);
      const address = addressParts.length > 0 ? addressParts.join(", ") : (ro.mobileAddress ?? "");

      // Format the scheduled time
      let scheduleInfo = "";
      if (ro.scheduledAt) {
        const scheduled = new Date(ro.scheduledAt);
        scheduleInfo = `\nScheduled: ${scheduled.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })} at ${scheduled.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
      }

      // Build notification body
      const bodyParts = [
        `${vehicleSummary} — ${customer?.name ?? "Customer"}`,
        `Complaint: ${ro.complaint}`,
      ];
      if (address) bodyParts.push(`Address: ${address}`);
      if (scheduleInfo) bodyParts.push(scheduleInfo.trim());
      if (ro.priority === "high") bodyParts.push("Priority: HIGH");

      const notifBody = bodyParts.join("\n");

      // Create tech notification
      await ctx.db.insert("techNotifications", {
        orgId: ro.orgId,
        memberId: args.assignedTo,
        roId: args.roId,
        type: "job_assigned",
        title: `New Job Assigned: ${ro.roNumber}`,
        body: notifBody,
        isRead: false,
        createdAt: new Date().toISOString(),
      });

      // Send push notification to the tech's device
      const techUser = await ctx.db.get(member.userId);
      if (techUser?.tokenIdentifier) {
        // visitorId is the subject part of tokenIdentifier (after "|")
        const visitorId = techUser.tokenIdentifier.split("|")[1];
        if (visitorId) {
          await ctx.scheduler.runAfter(0, internal.pushNotifications.sendNotification, {
            visitorIds: [visitorId],
            title: `New Job: ${ro.roNumber}`,
            body: notifBody,
            urgency: "high" as const,
          });
        }
      }

      // Also insert an auto-message on the RO so it appears in the messaging thread
      const assignerName = user.name ?? user.email ?? "Office";
      const assignerMember = await ctx.db
        .query("orgMembers")
        .withIndex("by_org_user", (q) => q.eq("orgId", ro.orgId).eq("userId", user._id))
        .first();

      if (assignerMember) {
        const msgParts = [
          `Job assigned to you.`,
          `Vehicle: ${vehicleSummary}`,
          `Customer: ${customer?.name ?? "Unknown"}`,
        ];
        if (address) msgParts.push(`Address: ${address}`);
        if (scheduleInfo) msgParts.push(scheduleInfo.trim());
        msgParts.push(`Complaint: ${ro.complaint}`);

        await ctx.db.insert("roMessages", {
          orgId: ro.orgId,
          roId: args.roId,
          senderId: assignerMember._id,
          senderName: assignerName,
          senderRole: assignerMember.role,
          body: msgParts.join("\n"),
          readByOffice: true,
          readByTech: false,
        });
      }
    }
  },
});

export const deleteRO = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    }
    await ctx.db.delete(args.roId);
  },
});

export const saveSignature = mutation({
  args: {
    roId: v.id("repairOrders"),
    signature: v.string(), // base64 data URL
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.roId, {
      customerSignature: args.signature,
      signedAt: new Date().toISOString(),
    });
  },
});

export const clearSignature = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "RO not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.roId, {
      customerSignature: undefined,
      signedAt: undefined,
    });
  },
});

export const getScheduledROs = query({
  args: {
    startDate: v.string(),
    endDate: v.string(),
    locationId: v.optional(v.id("locations")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];

    const ros = await ctx.db
      .query("repairOrders")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(500);

    const inRange = ros.filter((ro) => {
      // Location filter
      if (args.locationId && ro.locationId !== args.locationId) return false;
      const isoDate = ro.scheduledAt
        ? ro.scheduledAt
        : new Date(ro._creationTime).toISOString();
      return isoDate >= args.startDate && isoDate <= args.endDate + "T23:59:59.999Z";
    });

    return await Promise.all(
      inRange.map(async (ro) => {
        const customer = await ctx.db.get(ro.customerId);
        const vehicle = await ctx.db.get(ro.vehicleId);
        return {
          ...ro,
          customerName: customer?.name ?? "Unknown",
          vehicleSummary: vehicle
            ? `${vehicle.year} ${vehicle.make} ${vehicle.model}`
            : "Unknown",
        };
      })
    );
  },
});

export const addLaborMatrixEntry = mutation({
  args: {
    serviceCategory: v.string(),
    serviceDescription: v.string(),
    flatRateHours: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getAuthedUser(ctx);
    if (!user.currentOrgId) throw new ConvexError({ message: "No org", code: "BAD_REQUEST" });
    return await ctx.db.insert("laborMatrix", {
      orgId: user.currentOrgId,
      ...args,
    });
  },
});

// ─── Internal functions for AI Workflow ───────────────────────────────────────

export const getROWorkflowData = internalQuery({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const ro = await ctx.db.get(args.roId);
    if (!ro) return null;
    const vehicle = await ctx.db.get(ro.vehicleId);
    if (!vehicle) return null;
    const org = await ctx.db.get(ro.orgId);
    if (!org) return null;

    const vehicleStr = [vehicle.year, vehicle.make, vehicle.model, vehicle.engine]
      .filter(Boolean)
      .join(" ");

    return {
      complaint: ro.complaint,
      vehicle: vehicleStr,
      laborRate: org.laborRate ?? 120,
      taxRate: org.taxRate ?? 8.25,
    };
  },
});

export const patchROInternal = internalMutation({
  args: {
    roId: v.id("repairOrders"),
    fields: v.object({
      aiWorkflowStatus: v.optional(v.union(
        v.literal("pending"),
        v.literal("generating"),
        v.literal("completed"),
        v.literal("failed")
      )),
    }),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.roId, args.fields);
  },
});

export const applyAIWorkflow = internalMutation({
  args: {
    roId: v.id("repairOrders"),
    laborLines: v.array(v.object({
      description: v.string(),
      laborHours: v.number(),
      laborRate: v.number(),
      techNotes: v.optional(v.string()),
    })),
    partLines: v.array(v.object({
      description: v.string(),
      partNumber: v.optional(v.string()),
      quantity: v.number(),
      unitCost: v.number(),
      unitPrice: v.number(),
    })),
    diagnosticChecklist: v.array(v.object({
      item: v.string(),
      category: v.optional(v.union(
        v.literal("visual"),
        v.literal("electrical"),
        v.literal("mechanical"),
        v.literal("scan_tool"),
        v.literal("measurement")
      )),
      toolsRequired: v.optional(v.array(v.string())),
      verificationCriteria: v.optional(v.string()),
      completed: v.boolean(),
    })),
    repairChecklist: v.array(v.object({
      step: v.number(),
      title: v.string(),
      details: v.string(),
      toolsRequired: v.optional(v.array(v.string())),
      torqueSpecs: v.optional(v.string()),
      warning: v.optional(v.string()),
      completed: v.boolean(),
    })),
    probableCauses: v.array(v.object({
      cause: v.string(),
      likelihood: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      explanation: v.string(),
    })),
    recommendedServices: v.optional(v.array(v.object({
      service: v.string(),
      reason: v.string(),
      estimatedCost: v.optional(v.number()),
    }))),
    shopFees: v.optional(v.array(v.object({
      description: v.string(),
      amount: v.number(),
    }))),
    cause: v.optional(v.string()),
    ambiguityFlag: v.optional(v.string()),
    subtotal: v.number(),
    taxAmount: v.number(),
    totalAmount: v.number(),
  },
  handler: async (ctx, args) => {
    const ro = await ctx.db.get(args.roId);
    if (!ro) return;

    // Only apply estimate lines if RO still has empty lines (don't overwrite manual work)
    const hasManualLines = ro.laborLines.length > 0 || ro.partLines.length > 0;

    await ctx.db.patch(args.roId, {
      ...(hasManualLines ? {} : {
        laborLines: args.laborLines,
        partLines: args.partLines,
        shopFees: args.shopFees && args.shopFees.length > 0 ? args.shopFees : ro.shopFees,
        subtotal: args.subtotal,
        taxAmount: args.taxAmount,
        totalAmount: args.totalAmount,
      }),
      diagnosticChecklist: args.diagnosticChecklist,
      repairChecklist: args.repairChecklist,
      probableCauses: args.probableCauses,
      recommendedServices: args.recommendedServices,
      cause: args.cause ?? ro.cause,
      aiWorkflowStatus: "completed",
      aiAmbiguityFlag: args.ambiguityFlag,
    });
  },
});

// ─── Checklist mutations (technician-facing) ─────────────────────────────────

export const toggleDiagnosticItem = mutation({
  args: {
    roId: v.id("repairOrders"),
    index: v.number(),
    completed: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || !ro.diagnosticChecklist) return;
    const updated = [...ro.diagnosticChecklist];
    if (args.index < 0 || args.index >= updated.length) return;
    updated[args.index] = {
      ...updated[args.index],
      completed: args.completed,
      notes: args.notes ?? updated[args.index].notes,
    };
    await ctx.db.patch(args.roId, { diagnosticChecklist: updated });
  },
});

export const toggleRepairStep = mutation({
  args: {
    roId: v.id("repairOrders"),
    index: v.number(),
    completed: v.boolean(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await getAuthedUser(ctx);
    const ro = await ctx.db.get(args.roId);
    if (!ro || !ro.repairChecklist) return;
    const updated = [...ro.repairChecklist];
    if (args.index < 0 || args.index >= updated.length) return;
    updated[args.index] = {
      ...updated[args.index],
      completed: args.completed,
      notes: args.notes ?? updated[args.index].notes,
    };
    await ctx.db.patch(args.roId, { repairChecklist: updated });
  },
});
