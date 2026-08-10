import { describe, expect, it } from "vitest";

import { idTimestamp, isId, newId, newPublicToken, safeEqual } from "./id.js";

describe("newId", () => {
  it("produces a well-formed v7 uuid", () => {
    const id = newId();
    expect(isId(id)).toBe(true);
    expect(id[14]).toBe("7"); // version nibble
  });

  it("is unique across a tight loop", () => {
    const ids = new Set(Array.from({ length: 10_000 }, () => newId()));
    expect(ids.size).toBe(10_000);
  });

  it("sorts lexicographically in creation order", () => {
    const ids = Array.from({ length: 5_000 }, () => newId());
    const sorted = [...ids].sort();
    expect(sorted).toEqual(ids);
  });

  it("embeds a recoverable timestamp", () => {
    const before = Date.now();
    const id = newId();
    const after = Date.now();
    const embedded = idTimestamp(id).getTime();
    expect(embedded).toBeGreaterThanOrEqual(before);
    expect(embedded).toBeLessThanOrEqual(after);
  });
});

describe("isId", () => {
  it("rejects non-uuid values", () => {
    expect(isId("nope")).toBe(false);
    expect(isId("")).toBe(false);
    expect(isId(42)).toBe(false);
    expect(isId(null)).toBe(false);
  });
});

describe("newPublicToken", () => {
  it("is url-safe and unique", () => {
    const tokens = Array.from({ length: 1_000 }, () => newPublicToken());
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(43);
    }
    expect(new Set(tokens).size).toBe(1_000);
  });
});

describe("safeEqual", () => {
  it("compares correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
