import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { assertStoredImage } from "./uploadPolicy";
import { assertOrgResource, getActiveMembership, requireActiveMembership } from "./authorization";

export const createRecommendation = mutation({
  args: {
    roId: v.id("repairOrders"),
    title: v.string(),
    description: v.string(),
    urgency: v.union(v.literal("immediate"), v.literal("soon"), v.literal("future")),
    photoIds: v.array(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { user, member, orgId } = await requireActiveMembership(ctx);

    // Verify the RO belongs to this org
    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    if (args.photoIds.length > 5) {
      throw new ConvexError({ code: "BAD_REQUEST", message: "A recommendation can include at most 5 photos" });
    }
    for (const photoId of args.photoIds) {
      await assertStoredImage(ctx, photoId, "recommendation_photo");
    }

    const recommendationId = await ctx.db.insert("techRecommendations", {
      orgId,
      roId: args.roId,
      memberId: member._id,
      techName: user.name ?? "Technician",
      title: args.title,
      description: args.description,
      urgency: args.urgency,
      photoIds: args.photoIds,
      status: "pending",
      createdAt: new Date().toISOString(),
    });

    return recommendationId;
  },
});

export const listByRO = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return [];
    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== membership.orgId) return [];

    const recommendations = await ctx.db
      .query("techRecommendations")
      .withIndex("by_ro", (q) => q.eq("roId", args.roId))
      .collect();

    // Resolve photo URLs
    const withUrls = await Promise.all(
      recommendations.map(async (rec) => {
        const photoUrls = await Promise.all(
          rec.photoIds.map(async (storageId) => {
            const url = await ctx.storage.getUrl(storageId);
            return url;
          })
        );
        return {
          ...rec,
          photoUrls: photoUrls.filter((u): u is string => u !== null),
        };
      })
    );

    return withUrls;
  },
});

export const updateStatus = mutation({
  args: {
    recommendationId: v.id("techRecommendations"),
    status: v.union(v.literal("approved"), v.literal("declined")),
  },
  handler: async (ctx, args) => {
    const { member, orgId } = await requireActiveMembership(ctx);

    const rec = await ctx.db.get(args.recommendationId);
    assertOrgResource(rec, orgId, "Recommendation");

    await ctx.db.patch(args.recommendationId, {
      status: args.status,
      reviewedAt: new Date().toISOString(),
      reviewedBy: member._id,
    });
  },
});
