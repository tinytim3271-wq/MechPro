import { describe, expect, test } from "vitest";
import {
  MAX_IMAGE_BYTES,
  validateImageUploadDeclaration,
} from "./uploadPolicy";

describe("image upload policy", () => {
  test("accepts a declared image within the limit", () => {
    expect(() =>
      validateImageUploadDeclaration("ro_photo", "image/jpeg", MAX_IMAGE_BYTES),
    ).not.toThrow();
  });

  test("rejects unsupported MIME types", () => {
    expect(() =>
      validateImageUploadDeclaration("inspection_photo", "text/html", 128),
    ).toThrow("Unsupported image type");
  });

  test("rejects empty and oversized files", () => {
    expect(() =>
      validateImageUploadDeclaration("recommendation_photo", "image/png", 0),
    ).toThrow("10 MiB or smaller");
    expect(() =>
      validateImageUploadDeclaration("recommendation_photo", "image/png", MAX_IMAGE_BYTES + 1),
    ).toThrow("10 MiB or smaller");
  });
});