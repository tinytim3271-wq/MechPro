import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    }
    return await ctx.storage.generateUploadUrl();
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }

    if (!user.currentOrgId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "No organization selected" });
    }

    // Verify the RO belongs to the user's org
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== user.currentOrgId) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Repair order not found" });
    }

    const photoId = await ctx.db.insert("roPhotos", {
      orgId: user.currentOrgId,
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    }

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ code: "UNAUTHENTICATED", message: "Not authenticated" });
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    if (!user) {
      throw new ConvexError({ code: "NOT_FOUND", message: "User not found" });
    }

    const photo = await ctx.db.get(args.photoId);
    if (!photo) {
      throw new ConvexError({ code: "NOT_FOUND", message: "Photo not found" });
    }

    // Ensure the photo belongs to the user's org
    if (photo.orgId !== user.currentOrgId) {
      throw new ConvexError({ code: "FORBIDDEN", message: "Not authorized" });
    }

    // Delete the file from storage and the record from the database
    await ctx.storage.delete(photo.storageId);
    await ctx.db.delete(args.photoId);
  },
});
