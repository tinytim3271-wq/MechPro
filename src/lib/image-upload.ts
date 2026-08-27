import { makeFunctionReference } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

export type ImageUploadKind = "ro_photo" | "inspection_photo" | "recommendation_photo";

export const verifyImageUpload = makeFunctionReference<
  "action",
  { storageId: Id<"_storage">; kind: ImageUploadKind },
  null
>("uploadPolicy:verifyImageUpload");