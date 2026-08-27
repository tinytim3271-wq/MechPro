import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertStoredImage, validateImageUploadDeclaration } from "./uploadPolicy";
import { assertOrgResource, getActiveMembership, requireActiveMembership } from "./authorization";

export const generateUploadUrl = mutation({
  args: {
    kind: v.union(v.literal("ro_photo"), v.literal("recommendation_photo")),
    contentType: v.string(),
    size: v.number(),
  },
  handler: async (ctx, args) => {
    await requireActiveMembership(ctx);
    validateImageUploadDeclaration(args.kind, args.contentType, args.size);
    return await (ctx.storage.generateUploadUrl as unknown as (policy: {
      contentType: string;
      size: number;
      kind: string;
    }) => Promise<string>)(args);
  },
});

export const savePhoto = mutation({
  args: {
    roId: v.id("repairOrders"),
    storageId: v.id("_storage"),
    caption: v.optional(v.string()),
    photoType: v.optional(
      v.union(
        v.literal("intake"),
        v.literal("damage"),
        v.literal("during"),
        v.literal("complete")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { user, orgId } = await requireActiveMembership(ctx);

    // Verify the RO belongs to the user's org
    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    await assertStoredImage(ctx, args.storageId, "ro_photo");

    const photoId = await ctx.db.insert("roPhotos", {
      orgId,
      roId: args.roId,
      storageId: args.storageId,
      caption: args.caption,
      uploadedBy: user._id,
      uploadedAt: new Date().toISOString(),
      photoType: args.photoType,
    });

    return photoId;
  },
});

export const listPhotos = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return [];
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== membership.orgId) return [];

    const photos = await ctx.db
      .query("roPhotos")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    // Resolve storage URLs and filter out any with null URLs
    const photosWithUrls = await Promise.all(
      photos.map(async (photo) => {
        const url = await ctx.storage.getUrl(photo.storageId);
        if (!url) return null;
        return { ...photo, url };
      })
    );

    return photosWithUrls.filter(
      (p): p is NonNullable<typeof p> => p !== null
    );
  },
});

export const deletePhoto = mutation({
  args: { photoId: v.id("roPhotos") },
  handler: async (ctx, args) => {
    const { orgId } = await requireActiveMembership(ctx);

    const photo = await ctx.db.get(args.photoId);
    assertOrgResource(photo, orgId, "Photo");

    // Delete the file from storage and the record from the database
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.photoId);
  },
});
