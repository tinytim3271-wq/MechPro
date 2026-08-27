import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { v } from "convex/values";
import { query, validateArguments, validateReturnValue } from "./functions.ts";

describe("function validators", () => {
  const fn = query({
    args: {
      orgId: v.id("organizations"),
      limit: v.optional(v.number()),
      lines: v.array(v.object({ name: v.string(), quantity: v.number() })),
    },
    returns: v.object({ count: v.number() }),
    handler: async () => ({ count: 0 }),
  });

  it("accepts valid arguments and return values", () => {
    assert.doesNotThrow(() =>
      validateArguments(fn, {
        orgId: "org-1",
        lines: [{ name: "Filter", quantity: 2 }],
      }),
    );
    assert.doesNotThrow(() => validateReturnValue(fn, { count: 1 }));
  });

  it("rejects malformed and extra arguments with a field path", () => {
    assert.throws(
      () => validateArguments(fn, { orgId: "org-1", lines: [{ name: "Filter", quantity: "2" }] }),
      /arguments at args\.lines\[0\]\.quantity: expected number, received string/,
    );
    assert.throws(
      () => validateArguments(fn, { orgId: "org-1", lines: [], tenantOverride: "other" }),
      /arguments at args\.tenantOverride: expected no extra field/,
    );
  });

  it("rejects malformed return values", () => {
    assert.throws(
      () => validateReturnValue(fn, { count: "one" }),
      /return value at return\.count: expected number, received string/,
    );
  });
});