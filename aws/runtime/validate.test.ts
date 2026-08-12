import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { v, ConvexError } from "convex/values";
import { validateArgs } from "./validate.ts";
import { parseCognitoIssuer } from "./cognito.ts";

describe("validateArgs", () => {
  it("accepts empty args when no validator", () => {
    assert.deepEqual(validateArgs(undefined, {}), {});
  });

  it("requires declared fields", () => {
    assert.throws(
      () => validateArgs({ name: v.string() }, {}),
      (err: unknown) => err instanceof ConvexError,
    );
  });

  it("accepts optional fields when omitted", () => {
    const out = validateArgs(
      { name: v.string(), note: v.optional(v.string()) },
      { name: "Brake job" },
    );
    assert.equal(out.name, "Brake job");
    assert.equal("note" in out, false);
  });

  it("checks literals and unions", () => {
    const args = {
      status: v.union(v.literal("open"), v.literal("closed")),
    };
    assert.equal(validateArgs(args, { status: "open" }).status, "open");
    assert.throws(() => validateArgs(args, { status: "nope" }));
  });

  it("validates nested objects and arrays", () => {
    const out = validateArgs(
      {
        lines: v.array(v.object({ description: v.string(), hours: v.number() })),
      },
      { lines: [{ description: "Pads", hours: 1.5 }] },
    );
    assert.equal((out.lines as { hours: number }[])[0].hours, 1.5);
  });
});

describe("parseCognitoIssuer", () => {
  it("extracts region and pool id", () => {
    const parsed = parseCognitoIssuer(
      "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_AbCdEfGh",
    );
    assert.equal(parsed.region, "us-east-1");
    assert.equal(parsed.userPoolId, "us-east-1_AbCdEfGh");
  });

  it("rejects non-cognito issuers", () => {
    assert.throws(() => parseCognitoIssuer("https://auth.hercules.app"));
  });
});
