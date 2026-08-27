import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Pool, PoolClient } from "pg";
import { v } from "convex/values";
import { Runtime } from "./context.ts";
import { action } from "./functions.ts";

function runtimeWithTrackedClients() {
  const released: number[] = [];
  let nextClient = 0;
  const pool = {
    connect: async () => {
      const clientNumber = nextClient++;
      return { release: () => released.push(clientNumber) } as PoolClient;
    },
  } as Pool;
  const runtime = new Runtime({
    pool,
    verifyToken: async () => null,
    storage: { bucket: "test", s3: {} as never },
  });
  return { released, runtime };
}

describe("action client lifecycle", () => {
  it("releases both helper clients after success", async () => {
    const { released, runtime } = runtimeWithTrackedClients();
    const fn = action({
      args: {},
      returns: v.string(),
      handler: async () => "done",
    });

    assert.equal(await runtime.execute(fn, {}, null), "done");
    assert.deepEqual(released.sort(), [0, 1]);
  });

  it("releases both helper clients after handler or return validation failure", async () => {
    for (const handler of [
      async () => {
        throw new Error("handler failed");
      },
      async () => 42,
    ]) {
      const { released, runtime } = runtimeWithTrackedClients();
      const fn = action({ args: {}, returns: v.string(), handler });

      await assert.rejects(() => runtime.execute(fn, {}, null));
      assert.deepEqual(released.sort(), [0, 1]);
    }
  });
});