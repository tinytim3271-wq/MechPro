import { ConvexError } from "convex/values";
import type { Id } from "./_generated/dataModel.d.ts";
import type { MutationCtx } from "./_generated/server.d.ts";

export type ImageUploadKind = "ro_photo" | "inspection_photo" | "recommendation_photo";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

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

export async function assertStoredImage(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  kind: ImageUploadKind,
): Promise<void> {
  const metadata = await ctx.db.system.get(storageId);
  try {
    if (!metadata) {
      throw new ConvexError({ message: "Uploaded image was not found", code: "BAD_REQUEST" });
    }
    validateImageUploadDeclaration(kind, metadata.contentType ?? "", metadata.size);
  } catch (error) {
    await ctx.storage.delete(storageId).catch(() => undefined);
    throw error;
  }
}