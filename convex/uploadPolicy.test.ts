import { describe, expect, test } from "vitest";
import {
  detectImageContentType,
  MAX_IMAGE_BYTES,
  validateImageUploadDeclaration,
} from "./uploadPolicy";

describe("image upload policy", () => {
  test("detects image content from magic bytes rather than metadata", () => {
    expect(detectImageContentType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(detectImageContentType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(detectImageContentType(new TextEncoder().encode("<html>not an image</html>"))).toBeNull();
  });
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