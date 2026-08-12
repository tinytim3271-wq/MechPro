import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ConvexError } from "convex/values";

// ─── Queries ─────────────────────────────────────────────────────────────────

export const getSocialPosts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) return [];
    return await ctx.db
      .query("socialPosts")
      .withIndex("by_org", (q) => q.eq("orgId", user.currentOrgId!))
      .order("desc")
      .take(50);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const createSocialPost = mutation({
  args: {
    platform: v.union(
      v.literal("facebook"),
      v.literal("instagram"),
      v.literal("google"),
      v.literal("general")
    ),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("scheduled"), v.literal("published")),
    scheduledAt: v.optional(v.string()),
    tags: v.array(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No org", code: "BAD_REQUEST" });
    return await ctx.db.insert("socialPosts", {
      orgId: user.currentOrgId,
      createdBy: user._id,
      platform: args.platform,
      content: args.content,
      status: args.status,
      scheduledAt: args.scheduledAt,
      publishedAt: args.status === "published" ? new Date().toISOString() : undefined,
      tags: args.tags,
      imageUrl: args.imageUrl,
    });
  },
});

export const updateSocialPost = mutation({
  args: {
    id: v.id("socialPosts"),
    content: v.optional(v.string()),
    platform: v.optional(
      v.union(
        v.literal("facebook"),
        v.literal("instagram"),
        v.literal("google"),
        v.literal("general")
      )
    ),
    status: v.optional(
      v.union(v.literal("draft"), v.literal("scheduled"), v.literal("published"))
    ),
    scheduledAt: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Require auth + org ownership of the post
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No org", code: "BAD_REQUEST" });

    const post = await ctx.db.get(args.id);
    if (!post || post.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Post not found", code: "NOT_FOUND" });
    }

    const { id, ...fields } = args;
    const updates: Record<string, unknown> = {};
    if (fields.content !== undefined) updates.content = fields.content;
    if (fields.platform !== undefined) updates.platform = fields.platform;
    if (fields.status !== undefined) {
      updates.status = fields.status;
      if (fields.status === "published") updates.publishedAt = new Date().toISOString();
    }
    if (fields.scheduledAt !== undefined) updates.scheduledAt = fields.scheduledAt;
    if (fields.tags !== undefined) updates.tags = fields.tags;
    if (fields.imageUrl !== undefined) updates.imageUrl = fields.imageUrl;
    await ctx.db.patch(id, updates);
  },
});

export const deleteSocialPost = mutation({
  args: { id: v.id("socialPosts") },
  handler: async (ctx, args) => {
    // Require auth + org ownership of the post
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();
    if (!user?.currentOrgId) throw new ConvexError({ message: "No org", code: "BAD_REQUEST" });

    const post = await ctx.db.get(args.id);
    if (!post || post.orgId !== user.currentOrgId) {
      throw new ConvexError({ message: "Post not found", code: "NOT_FOUND" });
    }

    await ctx.db.delete(args.id);
  },
});
