import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx, QueryCtx } from "./_generated/server.d.ts";
import { assertStoredImage, createImageUploadTarget } from "./uploadPolicy";

// ─── Default template ─────────────────────────────────────────────────────────

const DEFAULT_TEMPLATE = [
  // Brakes
  { category: "Brakes", itemName: "Front brake pads", sortOrder: 0 },
  { category: "Brakes", itemName: "Rear brake pads", sortOrder: 1 },
  { category: "Brakes", itemName: "Front rotors", sortOrder: 2 },
  { category: "Brakes", itemName: "Rear rotors", sortOrder: 3 },
  { category: "Brakes", itemName: "Brake fluid", sortOrder: 4 },
  // Tires
  { category: "Tires & Wheels", itemName: "Left front tire", sortOrder: 10 },
  { category: "Tires & Wheels", itemName: "Right front tire", sortOrder: 11 },
  { category: "Tires & Wheels", itemName: "Left rear tire", sortOrder: 12 },
  { category: "Tires & Wheels", itemName: "Right rear tire", sortOrder: 13 },
  { category: "Tires & Wheels", itemName: "Spare tire", sortOrder: 14 },
  // Fluids
  { category: "Fluids", itemName: "Engine oil", sortOrder: 20 },
  { category: "Fluids", itemName: "Coolant / antifreeze", sortOrder: 21 },
  { category: "Fluids", itemName: "Transmission fluid", sortOrder: 22 },
  { category: "Fluids", itemName: "Power steering fluid", sortOrder: 23 },
  { category: "Fluids", itemName: "Windshield washer fluid", sortOrder: 24 },
  // Lighting
  { category: "Lighting", itemName: "Headlights", sortOrder: 30 },
  { category: "Lighting", itemName: "Taillights & brake lights", sortOrder: 31 },
  { category: "Lighting", itemName: "Turn signals", sortOrder: 32 },
  { category: "Lighting", itemName: "Hazard lights", sortOrder: 33 },
  // Engine
  { category: "Engine & Underhood", itemName: "Air filter", sortOrder: 40 },
  { category: "Engine & Underhood", itemName: "Battery & cables", sortOrder: 41 },
  { category: "Engine & Underhood", itemName: "Belts", sortOrder: 42 },
  { category: "Engine & Underhood", itemName: "Hoses", sortOrder: 43 },
  // Suspension
  { category: "Suspension & Steering", itemName: "Shocks / struts", sortOrder: 50 },
  { category: "Suspension & Steering", itemName: "Ball joints", sortOrder: 51 },
  { category: "Suspension & Steering", itemName: "Tie rods", sortOrder: 52 },
  { category: "Suspension & Steering", itemName: "CV axles", sortOrder: 53 },
  // Exterior
  { category: "Exterior", itemName: "Windshield condition", sortOrder: 60 },
  { category: "Exterior", itemName: "Wipers", sortOrder: 61 },
  { category: "Exterior", itemName: "Mirrors", sortOrder: 62 },
] as const;

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function requireOrgMember(ctx: MutationCtx | QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) throw new ConvexError({ code: "FORBIDDEN", message: "No organization" });
  return { user, orgId: user.currentOrgId as Id<"organizations"> };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getInspection = query({
  args: { inspectionId: v.id("inspections") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const inspection = await ctx.db.get(args.inspectionId);
    if (!inspection || inspection.orgId !== orgId) return null;

    const items = await ctx.db
      .query("inspectionItems")
      .withIndex("by_inspection", (q) => q.eq("inspectionId", args.inspectionId))
      .collect();

    // Resolve photo URLs
    const itemsWithPhotos = await Promise.all(
      items.map(async (item) => {
        const photoUrl = item.photoStorageId
          ? await ctx.storage.getUrl(item.photoStorageId)
          : null;
        return { ...item, photoUrl };
      })
    );

    return { ...inspection, items: itemsWithPhotos.sort((a, b) => a.sortOrder - b.sortOrder) };
  },
});

export const getInspectionByRO = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);

    const inspections = await ctx.db
      .query("inspections")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    const orgInspections = inspections.filter((i) => i.orgId === orgId);
    if (orgInspections.length === 0) return null;

    // Return the most recent one
    const inspection = orgInspections[orgInspections.length - 1];

    const items = await ctx.db
      .query("inspectionItems")
      .withIndex("by_inspection", (q) => q.eq("inspectionId", inspection._id))
      .collect();

    const itemsWithPhotos = await Promise.all(
      items.map(async (item) => {
        const photoUrl = item.photoStorageId
          ? await ctx.storage.getUrl(item.photoStorageId)
          : null;
        return { ...item, photoUrl };
      })
    );

    return { ...inspection, items: itemsWithPhotos.sort((a, b) => a.sortOrder - b.sortOrder) };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createInspection = mutation({
  args: {
    roId: v.id("repairOrders"),
    templateName: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"inspections">> => {
    const { user, orgId } = await requireOrgMember(ctx);

    // Ensure RO belongs to org
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "RO not found" });

    // Find the member record for completedBy
    const member = await ctx.db
      .query("orgMembers")
      .withIndex("by_org_user", (q) => q.eq("orgId", orgId).eq("userId", user._id))
      .first();

    const inspectionId = await ctx.db.insert("inspections", {
      orgId,
      roId: args.roId,
      templateName: args.templateName ?? "Multi-Point Inspection",
      completedBy: member?._id,
      status: "in_progress",
    });

    // Seed items from default template — all start as "na" (not assessed)
    for (const item of DEFAULT_TEMPLATE) {
      await ctx.db.insert("inspectionItems", {
        inspectionId,
        orgId,
        category: item.category,
        itemName: item.itemName,
        result: "na",
        sortOrder: item.sortOrder,
      });
    }

    return inspectionId;
  },
});

export const updateItemResult = mutation({
  args: {
    itemId: v.id("inspectionItems"),
    result: v.union(v.literal("ok"), v.literal("needs_attention"), v.literal("critical"), v.literal("na")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Item not found" });
    await ctx.db.patch(args.itemId, { result: args.result, notes: args.notes });
  },
});

export const addCustomItem = mutation({
  args: {
    inspectionId: v.id("inspections"),
    category: v.string(),
    itemName: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const inspection = await ctx.db.get(args.inspectionId);
    if (!inspection || inspection.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Inspection not found" });

    // Get the max sortOrder
    const items = await ctx.db
      .query("inspectionItems")
      .withIndex("by_inspection", (q) => q.eq("inspectionId", args.inspectionId))
      .collect();
    const maxOrder = items.reduce((m, i) => Math.max(m, i.sortOrder), 0);

    await ctx.db.insert("inspectionItems", {
      inspectionId: args.inspectionId,
      orgId,
      category: args.category,
      itemName: args.itemName,
      result: "na",
      sortOrder: maxOrder + 10,
    });
  },
});

export const attachPhotoToItem = mutation({
  args: {
    itemId: v.id("inspectionItems"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Item not found" });
    await assertStoredImage(ctx, args.storageId, "inspection_photo");
    await ctx.db.patch(args.itemId, { photoStorageId: args.storageId });
  },
});

export const removePhotoFromItem = mutation({
  args: { itemId: v.id("inspectionItems") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const item = await ctx.db.get(args.itemId);
    if (!item || item.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Item not found" });
    if (item.photoStorageId) {
      await ctx.storage.delete(item.photoStorageId);
    }
    await ctx.db.patch(args.itemId, { photoStorageId: undefined });
  },
});

export const completeInspection = mutation({
  args: { inspectionId: v.id("inspections"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const inspection = await ctx.db.get(args.inspectionId);
    if (!inspection || inspection.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Inspection not found" });
    await ctx.db.patch(args.inspectionId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      notes: args.notes,
    });
  },
});

export const deleteInspection = mutation({
  args: { inspectionId: v.id("inspections") },
  handler: async (ctx, args) => {
    const { orgId } = await requireOrgMember(ctx);
    const inspection = await ctx.db.get(args.inspectionId);
    if (!inspection || inspection.orgId !== orgId) throw new ConvexError({ code: "NOT_FOUND", message: "Inspection not found" });

    // Delete all items first
    const items = await ctx.db
      .query("inspectionItems")
      .withIndex("by_inspection", (q) => q.eq("inspectionId", args.inspectionId))
      .collect();
    for (const item of items) {
      if (item.photoStorageId) await ctx.storage.delete(item.photoStorageId);
      await ctx.db.delete(item._id);
    }

    await ctx.db.delete(args.inspectionId);
  },
});

// Upload URL (reuse roPhotos pattern)
export const generateUploadUrl = mutation({
  args: { contentType: v.string(), size: v.number() },
  handler: async (ctx, args) => {
    return createImageUploadTarget(ctx, "inspection_photo", args.contentType, args.size);
  },
});
