import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { Id } from "./_generated/dataModel.d.ts";
import { action, internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server.d.ts";
import { requireActiveMembership } from "./authorization";

export type ImageUploadKind = "ro_photo" | "inspection_photo" | "recommendation_photo";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_UPLOAD_CLAIM_TTL_MS = 20 * 60 * 1000;
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const getUploadVerifierRef = makeFunctionReference<
  "query",
  Record<string, never>,
  { orgId: Id<"organizations">; userId: Id<"users"> } | null
>("uploadPolicy:getUploadVerifier");

const recordVerifiedImageRef = makeFunctionReference<
  "mutation",
  { storageId: Id<"_storage">; claimToken: string; kind: ImageUploadKind; detectedContentType: string },
  { recorded: boolean; reason?: string }
>("uploadPolicy:recordVerifiedImage");

const prepareImageInspectionRef = makeFunctionReference<
  "mutation",
  { storageId: Id<"_storage">; claimToken: string; kind: ImageUploadKind },
  null
>("uploadPolicy:prepareImageInspection");

const discardRejectedImageRef = makeFunctionReference<
  "mutation",
  { storageId: Id<"_storage">; claimToken: string },
  null
>("uploadPolicy:discardRejectedImage");

const expirePendingImageUploadRef = makeFunctionReference<
  "mutation",
  { claimToken: string },
  null
>("uploadPolicy:expirePendingImageUpload");

export function detectImageContentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8
    && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte)
  ) {
    return "image/png";
  }
  const decoder = new TextDecoder();
  if (
    bytes.length >= 12
    && decoder.decode(bytes.slice(0, 4)) === "RIFF"
    && decoder.decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && decoder.decode(bytes.slice(4, 8)) === "ftyp") {
    const brand = decoder.decode(bytes.slice(8, 12)).toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

function contentTypesMatch(declared: string, detected: string): boolean {
  const normalized = declared.toLowerCase();
  if (normalized === detected) return true;
  return [normalized, detected].every((value) => value === "image/heic" || value === "image/heif");
}

export function validateImageUploadDeclaration(
  kind: ImageUploadKind,
  contentType: string,
  size: number,
): void {
  if (!kind) {
    throw new ConvexError({ message: "Upload kind is required", code: "BAD_REQUEST" });
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.has(contentType.toLowerCase())) {
    throw new ConvexError({ message: "Unsupported image type", code: "BAD_REQUEST" });
  }
  if (!Number.isInteger(size) || size < 1 || size > MAX_IMAGE_BYTES) {
    throw new ConvexError({ message: "Image must be 10 MiB or smaller", code: "BAD_REQUEST" });
  }
}

export async function createImageUploadTarget(
  ctx: MutationCtx,
  kind: ImageUploadKind,
  contentType: string,
  size: number,
): Promise<{ uploadUrl: string; claimToken: string; storageId?: Id<"_storage"> }> {
  const { orgId, user } = await requireActiveMembership(ctx);
  validateImageUploadDeclaration(kind, contentType, size);
  const claimToken = crypto.randomUUID();
  const expiresAt = Date.now() + IMAGE_UPLOAD_CLAIM_TTL_MS;
  const target = await (ctx.storage.generateUploadUrl as unknown as (policy: {
    contentType: string;
    size: number;
    kind: string;
  }) => Promise<string | { url: string; storageId: Id<"_storage"> }>)({ contentType, size, kind });
  await ctx.db.insert("pendingImageUploads", {
    claimToken,
    ...(typeof target === "string" ? {} : { storageId: target.storageId }),
    orgId,
    userId: user._id,
    kind,
    contentType: contentType.toLowerCase(),
    size,
    createdAt: new Date().toISOString(),
    expiresAt,
  });
  await ctx.scheduler.runAfter(IMAGE_UPLOAD_CLAIM_TTL_MS, expirePendingImageUploadRef, { claimToken });
  return typeof target === "string"
    ? { uploadUrl: target, claimToken }
    : { uploadUrl: target.url, storageId: target.storageId, claimToken };
}

export function isImageVerificationValid(
  verification: {
    orgId: Id<"organizations">;
    kind: ImageUploadKind;
    contentType: string;
    size: number;
  } | null,
  expected: {
    orgId: Id<"organizations">;
    kind: ImageUploadKind;
    contentType: string;
    size: number;
  },
): boolean {
  return verification !== null
    && verification.orgId === expected.orgId
    && verification.kind === expected.kind
    && verification.contentType === expected.contentType.toLowerCase()
    && verification.size === expected.size;
}

export async function assertStoredImage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  kind: ImageUploadKind,
): Promise<void> {
  const { orgId } = await requireActiveMembership(ctx);
  const metadata = await ctx.db.system.get(storageId);
  const verification = await ctx.db
    .query("verifiedImageUploads")
    .withIndex("by_storage", (query) => query.eq("storageId", storageId))
    .unique();
  if (!metadata) {
    throw new ConvexError({ message: "Uploaded image was not found", code: "BAD_REQUEST" });
  }
  validateImageUploadDeclaration(kind, metadata.contentType ?? "", metadata.size);
  if (!isImageVerificationValid(verification, {
    orgId,
    kind,
    contentType: metadata.contentType ?? "",
    size: metadata.size,
  })) {
    throw new ConvexError({ message: "Image content has not been verified", code: "BAD_REQUEST" });
  }
}

export const getUploadVerifier = internalQuery({
  args: {},
  handler: async (ctx) => {
    const membership = await requireActiveMembership(ctx).catch(() => null);
    return membership ? { orgId: membership.orgId, userId: membership.user._id } : null;
  },
});

export const prepareImageInspection = internalMutation({
  args: {
    storageId: v.id("_storage"),
    claimToken: v.string(),
    kind: v.union(
      v.literal("ro_photo"),
      v.literal("inspection_photo"),
      v.literal("recommendation_photo"),
    ),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireActiveMembership(ctx);
    const claim = await ctx.db
      .query("pendingImageUploads")
      .withIndex("by_claim_token", (query) => query.eq("claimToken", args.claimToken))
      .unique();
    if (!claim || claim.orgId !== orgId || claim.userId !== user._id || claim.kind !== args.kind) {
      throw new ConvexError({ message: "Upload claim is invalid or belongs to another user", code: "FORBIDDEN" });
    }
    if (claim.expiresAt <= Date.now()) {
      if (claim.storageId) await ctx.storage.delete(claim.storageId);
      await ctx.db.delete(claim._id);
      throw new ConvexError({ message: "Upload claim has expired", code: "BAD_REQUEST" });
    }
    if (claim.storageId && claim.storageId !== args.storageId) {
      throw new ConvexError({ message: "Upload claim belongs to another object", code: "FORBIDDEN" });
    }
    if (!await ctx.db.system.get(args.storageId)) {
      throw new ConvexError({ message: "Uploaded image was not found", code: "BAD_REQUEST" });
    }
    if (!claim.storageId) await ctx.db.patch(claim._id, { storageId: args.storageId });
    return null;
  },
});

export const expirePendingImageUpload = internalMutation({
  args: { claimToken: v.string() },
  handler: async (ctx, args) => {
    const claim = await ctx.db
      .query("pendingImageUploads")
      .withIndex("by_claim_token", (query) => query.eq("claimToken", args.claimToken))
      .unique();
    if (!claim || claim.expiresAt > Date.now()) return null;
    if (claim.storageId) await ctx.storage.delete(claim.storageId);
    await ctx.db.delete(claim._id);
    return null;
  },
});

export const recordVerifiedImage = internalMutation({
  args: {
    storageId: v.id("_storage"),
    claimToken: v.string(),
    kind: v.union(
      v.literal("ro_photo"),
      v.literal("inspection_photo"),
      v.literal("recommendation_photo"),
    ),
    detectedContentType: v.string(),
  },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireActiveMembership(ctx);
    const claim = await ctx.db
      .query("pendingImageUploads")
      .withIndex("by_claim_token", (query) => query.eq("claimToken", args.claimToken))
      .unique();
    if (!claim || claim.orgId !== orgId || claim.userId !== user._id || claim.kind !== args.kind) {
      return { recorded: false, reason: "Upload claim is invalid or belongs to another user" };
    }
    if (claim.storageId !== args.storageId) {
      return { recorded: false, reason: "Upload claim belongs to another object" };
    }
    const metadata = await ctx.db.system.get(args.storageId);
    if (!metadata) throw new ConvexError({ message: "Uploaded image was not found", code: "BAD_REQUEST" });
    validateImageUploadDeclaration(args.kind, metadata.contentType ?? "", metadata.size);
    if (claim.contentType !== (metadata.contentType ?? "").toLowerCase() || claim.size !== metadata.size) {
      return { recorded: false, reason: "Uploaded image does not match its allocation" };
    }
    const existing = await ctx.db
      .query("verifiedImageUploads")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing && existing.orgId !== orgId) {
      return { recorded: false, reason: "Image belongs to another organization" };
    }
    if (!contentTypesMatch(metadata.contentType ?? "", args.detectedContentType)) {
      if (existing) await ctx.db.delete(existing._id);
      await ctx.storage.delete(args.storageId);
      await ctx.db.delete(claim._id);
      return { recorded: false, reason: "Image content does not match its declared type" };
    }
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("verifiedImageUploads", {
      storageId: args.storageId,
      orgId,
      userId: user._id,
      kind: args.kind,
      contentType: (metadata.contentType ?? "").toLowerCase(),
      size: metadata.size,
      verifiedAt: new Date().toISOString(),
    });
    await ctx.db.delete(claim._id);
    return { recorded: true };
  },
});

export const discardRejectedImage = internalMutation({
  args: { storageId: v.id("_storage"), claimToken: v.string() },
  handler: async (ctx, args) => {
    const { orgId, user } = await requireActiveMembership(ctx);
    const claim = await ctx.db
      .query("pendingImageUploads")
      .withIndex("by_claim_token", (query) => query.eq("claimToken", args.claimToken))
      .unique();
    if (!claim || claim.orgId !== orgId || claim.userId !== user._id) {
      throw new ConvexError({ message: "Upload claim is invalid or belongs to another user", code: "FORBIDDEN" });
    }
    if (claim.storageId !== args.storageId) {
      throw new ConvexError({ message: "Upload claim belongs to another object", code: "FORBIDDEN" });
    }
    const existing = await ctx.db
      .query("verifiedImageUploads")
      .withIndex("by_storage", (query) => query.eq("storageId", args.storageId))
      .unique();
    if (existing && existing.orgId !== orgId) {
      throw new ConvexError({ message: "Image belongs to another organization", code: "FORBIDDEN" });
    }
    if (existing) await ctx.db.delete(existing._id);
    await ctx.storage.delete(args.storageId);
    await ctx.db.delete(claim._id);
    return null;
  },
});

export const verifyImageUpload = action({
  args: {
    storageId: v.id("_storage"),
    claimToken: v.string(),
    kind: v.union(
      v.literal("ro_photo"),
      v.literal("inspection_photo"),
      v.literal("recommendation_photo"),
    ),
  },
  handler: async (ctx, args) => {
    const verifier = await ctx.runQuery(getUploadVerifierRef, {});
    if (!verifier) throw new ConvexError({ message: "Not authorized", code: "UNAUTHENTICATED" });
    await ctx.runMutation(prepareImageInspectionRef, args);
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      await ctx.runMutation(discardRejectedImageRef, args);
      throw new ConvexError({ message: "Uploaded image was not found", code: "BAD_REQUEST" });
    }
    let response: Response;
    try {
      response = await fetch(url, { headers: { Range: "bytes=0-31" } });
    } catch {
      await ctx.runMutation(discardRejectedImageRef, args);
      throw new ConvexError({ message: "Uploaded image could not be inspected", code: "BAD_REQUEST" });
    }
    if (!response.ok) {
      await ctx.runMutation(discardRejectedImageRef, args);
      throw new ConvexError({ message: "Uploaded image could not be inspected", code: "BAD_REQUEST" });
    }
    const detectedContentType = detectImageContentType(new Uint8Array(await response.arrayBuffer()));
    if (!detectedContentType) {
      await ctx.runMutation(discardRejectedImageRef, {
        storageId: args.storageId,
        claimToken: args.claimToken,
      });
      throw new ConvexError({ message: "Uploaded file is not a supported image", code: "BAD_REQUEST" });
    }
    const result = await ctx.runMutation(recordVerifiedImageRef, { ...args, detectedContentType });
    if (!result.recorded) {
      throw new ConvexError({ message: result.reason ?? "Image could not be verified", code: "FORBIDDEN" });
    }
    return null;
  },
});