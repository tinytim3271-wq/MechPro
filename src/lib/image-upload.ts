import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export type ImageUploadKind = "ro_photo" | "inspection_photo" | "recommendation_photo";

export const verifyImageUpload = makeFunctionReference<
  "action",
  { storageId: Id<"_storage">; claimToken: string; kind: ImageUploadKind },
  null
>("uploadPolicy:verifyImageUpload");

export type ImageUploadTarget = {
  uploadUrl: string;
  claimToken: string;
  storageId?: Id<"_storage">;
};

export async function uploadImageFile(target: ImageUploadTarget, file: File): Promise<Id<"_storage">> {
  const response = await fetch(target.uploadUrl, {
    method: target.storageId ? "PUT" : "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!response.ok) throw new Error("Upload failed");
  if (target.storageId) return target.storageId;
  return ((await response.json()) as { storageId: Id<"_storage"> }).storageId;
}