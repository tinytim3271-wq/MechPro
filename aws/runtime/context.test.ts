/**
 * Execution-model tests.
 *
 * These pin the behaviours the ported Convex functions silently rely on:
 * mutation atomicity, nested calls sharing the caller's transaction, scheduled
 * jobs being discarded when their mutation rolls back, and the query/mutation/
 * action calling rules.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import pg from "pg";
import { S3Client } from "@aws-sdk/client-s3";
import { v } from "convex/values";
import { Runtime } from "./context.ts";
import { generateId } from "./db.ts";
import {
  action,
  internal,
  internalMutation,
  internalQuery,
  mutation,
  query,
  registerModule,
} from "./functions.ts";
import { claimDueJobs } from "./scheduler.ts";
import type { MutationCtx, QueryCtx, ActionCtx } from "./context.ts";

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:devpw@localhost:55433/mechpro";

const ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test";
const SUBJECT = "sub-abc-123";
const VALID_TOKEN = "valid-token";

let pool: pg.Pool;
let runtime: Runtime;
let orgId: string;
let userId: string;

// ─── Test modules, registered exactly as ported convex/ modules would be ─────

const testCustomers = {
  list: query({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: QueryCtx, args: { orgId: string }) =>
      ctx.db.query("customers").withIndex("by_org", (q) => q.eq("orgId", args.orgId)).collect(),
  }),

  create: mutation({
    args: { orgId: v.id("organizations"), name: v.string() },
    handler: async (ctx: MutationCtx, args: { orgId: string; name: string }) =>
      ctx.db.insert("customers", { orgId: args.orgId, name: args.name }),
  }),

  createThenFail: mutation({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: MutationCtx, args: { orgId: string }) => {
      await ctx.db.insert("customers", { orgId: args.orgId, name: "Doomed" });
      throw new Error("deliberate failure");
    },
  }),

  countInternal: internalQuery({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: QueryCtx, args: { orgId: string }) => {
      const rows = await ctx.db
        .query("customers")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .collect();
      return rows.length;
    },
  }),

  createInternal: internalMutation({
    args: { orgId: v.id("organizations"), name: v.string() },
    handler: async (ctx: MutationCtx, args: { orgId: string; name: string }) =>
      ctx.db.insert("customers", { orgId: args.orgId, name: args.name }),
  }),

  /** Writes, then reads its own uncommitted write through a nested query. */
  createAndCount: mutation({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: MutationCtx, args: { orgId: string }) => {
      await ctx.db.insert("customers", { orgId: args.orgId, name: "Nested" });
      return ctx.runQuery(internal.testCustomers.countInternal, { orgId: args.orgId });
    },
  }),

  /** Nested mutation then a deliberate failure: both writes must vanish. */
  nestedThenFail: mutation({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: MutationCtx, args: { orgId: string }) => {
      await ctx.runMutation(internal.testCustomers.createInternal, {
        orgId: args.orgId,
        name: "NestedDoomed",
      });
      throw new Error("deliberate failure after nested mutation");
    },
  }),

  scheduleThenFail: mutation({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: MutationCtx, args: { orgId: string }) => {
      await ctx.scheduler.runAfter(0, internal.testEmail.send, { to: "x@example.com" });
      await ctx.db.insert("customers", { orgId: args.orgId, name: "ScheduledDoomed" });
      throw new Error("deliberate failure after scheduling");
    },
  }),

  scheduleThenSucceed: mutation({
    args: {},
    handler: async (ctx: MutationCtx) => {
      await ctx.scheduler.runAfter(0, internal.testEmail.send, { to: "ok@example.com" });
      return "scheduled";
    },
  }),

  whoAmI: query({
    args: {},
    handler: async (ctx: QueryCtx) => ctx.auth.getUserIdentity(),
  }),

  /** Reports which write methods a query's ctx.db exposes (expected: none). */
  writeMethodsOnQueryDb: query({
    args: {},
    handler: async (ctx: QueryCtx) =>
      (["insert", "patch", "replace", "delete"] as const).filter(
        (m) => typeof (ctx.db as unknown as Record<string, unknown>)[m] === "function",
      ),
  }),

  /**
   * Second line of defence: even reaching past ctx.db to the raw connection
   * must fail, because a query's transaction is opened READ ONLY.
   */
  rawWriteFromQuery: query({
    args: { orgId: v.id("organizations") },
    handler: async (ctx: QueryCtx, args: { orgId: string }) => {
      const client = (ctx.db as unknown as { client: pg.PoolClient }).client;
      await client.query(
        `INSERT INTO "customers" ("_id","_creationTime","orgId","name") VALUES ($1,$2,$3,$4)`,
        [generateId(), Date.now(), args.orgId, "Illegal"],
      );
      return "wrote";
    },
  }),

  /** Illegal: a mutation attempting to call an action directly. */
  actionFromMutation: mutation({
    args: {},
    handler: async (ctx: MutationCtx) =>
      (ctx as unknown as { runAction?: (r: unknown) => Promise<unknown> }).runAction?.(
        internal.testEmail.send,
      ) ?? ctx.runQuery(internal.testEmail.send, {}),
  }),
};

const testEmail = {
  send: action({
    args: { to: v.string() },
    handler: async (_ctx: ActionCtx, args: { to: string }) => `sent:${args.to}`,
  }),

  sendViaAction: action({
    args: { orgId: v.id("organizations"), name: v.string() },
    handler: async (ctx: ActionCtx, args: { orgId: string; name: string }) => {
      const id = await ctx.runMutation(internal.testCustomers.createInternal, {
        orgId: args.orgId,
        name: args.name,
      });
      const count = await ctx.runQuery(internal.testCustomers.countInternal, {
        orgId: args.orgId,
      });
      return { id, count };
    },
  }),

  failViaAction: action({
    args: {},
    handler: async () => {
      throw new Error("action failed");
    },
  }),
};

before(async () => {
  pool = new pg.Pool({ connectionString: CONNECTION });

  registerModule("testCustomers", testCustomers);
  registerModule("testEmail", testEmail);

  runtime = new Runtime({
    pool,
    verifyToken: async (token) =>
      token === VALID_TOKEN
        ? { iss: ISSUER, sub: SUBJECT, email: "owner@example.com", name: "Owner" }
        : null,
    storage: { bucket: "test-bucket", client: new S3Client({ region: "us-east-1" }) },
  });

  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
        LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP;
      END $$;
    `);
    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    userId = generateId();
    orgId = generateId();
    await client.query(
      `INSERT INTO "users" ("_id","_creationTime","tokenIdentifier","currentOrgId")
       VALUES ($1,$2,$3,$4)`,
      [userId, Date.now(), `${ISSUER}|${SUBJECT}`, orgId],
    );
    await client.query(
      `INSERT INTO "organizations"
         ("_id","_creationTime","name","ownerId","taxRate","laborRate","bayCount","bayNames","isActive")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orgId, Date.now(), "Test Shop", userId, 8.25, 120, 1, JSON.stringify(["Bay 1"]), true],
    );
    await client.query(
      `INSERT INTO "_idIndex" ("_id","tableName") VALUES ($1,'users'),($2,'organizations')`,
      [userId, orgId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
});

after(async () => {
  await pool?.end();
});

beforeEach(async () => {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM "customers"');
    await client.query('DELETE FROM "_scheduledFunctions"');
  } finally {
    client.release();
  }
});

async function customerCount(): Promise<number> {
  const rows = (await runtime.executeByReference(
    internal.testCustomers.list,
    { orgId },
    null,
  )) as unknown[];
  return rows.length;
}

describe("function references", () => {
  it("builds module:function paths from property access", async () => {
    const id = await runtime.executeByReference(
      internal.testCustomers.create,
      { orgId, name: "RefTest" },
      null,
    );
    assert.equal(typeof id, "string");
  });

  it("throws a clear error for an unregistered function", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.nope.missing, {}, null),
      /Function not found: nope:missing/,
    );
  });
});

describe("mutation atomicity", () => {
  it("commits writes when the handler returns", async () => {
    await runtime.executeByReference(internal.testCustomers.create, { orgId, name: "Kept" }, null);
    assert.equal(await customerCount(), 1);
  });

  it("rolls back writes when the handler throws", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.testCustomers.createThenFail, { orgId }, null),
      /deliberate failure/,
    );
    assert.equal(await customerCount(), 0, "failed mutation must leave no rows behind");
  });

  it("rolls back writes made by a nested mutation", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.testCustomers.nestedThenFail, { orgId }, null),
      /deliberate failure/,
    );
    assert.equal(await customerCount(), 0, "nested write must share the caller's transaction");
  });
});

describe("nested calls", () => {
  it("a nested query sees the caller's uncommitted writes", async () => {
    const count = await runtime.executeByReference(
      internal.testCustomers.createAndCount,
      { orgId },
      null,
    );
    assert.equal(count, 1, "nested query must join the caller's transaction");
  });

  it("a query cannot call a mutation", async () => {
    await assert.rejects(
      () =>
        runtime.executeByReference(
          internal.testCustomers.actionFromMutation,
          {},
          null,
        ),
      /Cannot call an action from a query or mutation|Cannot call a mutation from a query/,
    );
  });

  it("a query's ctx.db exposes no write methods", async () => {
    const exposed = await runtime.executeByReference(
      internal.testCustomers.writeMethodsOnQueryDb,
      {},
      null,
    );
    assert.deepEqual(exposed, [], "DatabaseReader must not expose insert/patch/replace/delete");
  });

  it("a query's transaction is READ ONLY, so even a raw write is refused", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.testCustomers.rawWriteFromQuery, { orgId }, null),
      /read-only transaction/i,
    );
    assert.equal(await customerCount(), 0);
  });
});

describe("actions", () => {
  it("run without a transaction and can drive queries and mutations", async () => {
    const result = (await runtime.executeByReference(
      internal.testEmail.sendViaAction,
      { orgId, name: "FromAction" },
      null,
    )) as { id: string; count: number };

    assert.equal(typeof result.id, "string");
    assert.equal(result.count, 1);
    assert.equal(await customerCount(), 1, "an action's mutation commits independently");
    assert.equal(pool.idleCount, pool.totalCount, "successful actions must release helper clients");
  });

  it("release helper clients when the handler throws", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.testEmail.failViaAction, {}, null),
      /action failed/,
    );
    assert.equal(pool.idleCount, pool.totalCount, "failed actions must release helper clients");
  });
});

describe("scheduler", () => {
  it("enqueues a job that a drainer can claim", async () => {
    await runtime.executeByReference(internal.testCustomers.scheduleThenSucceed, {}, null);

    const client = await pool.connect();
    try {
      const jobs = await claimDueJobs(client);
      assert.equal(jobs.length, 1);
      assert.equal(jobs[0].functionPath, "testEmail:send");
      assert.deepEqual(jobs[0].args, { to: "ok@example.com" });
    } finally {
      client.release();
    }
  });

  it("discards the job when its mutation rolls back", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.testCustomers.scheduleThenFail, { orgId }, null),
      /deliberate failure/,
    );

    const client = await pool.connect();
    try {
      const jobs = await claimDueJobs(client);
      assert.equal(jobs.length, 0, "a scheduled job must not survive a rolled-back mutation");
    } finally {
      client.release();
    }
    assert.equal(await customerCount(), 0);
  });
});

describe("auth", () => {
  it("builds tokenIdentifier as issuer|subject, matching Convex", async () => {
    const identity = (await runtime.executeByReference(
      internal.testCustomers.whoAmI,
      {},
      VALID_TOKEN,
    )) as { tokenIdentifier: string; email: string } | null;
    assert.ok(identity);
    assert.equal(identity.tokenIdentifier, `${ISSUER}|${SUBJECT}`);
    assert.equal(identity.email, "owner@example.com");
  });

  it("returns null for a missing token", async () => {
    assert.equal(await runtime.executeByReference(internal.testCustomers.whoAmI, {}, null), null);
  });

  it("returns null for an invalid token rather than throwing", async () => {
    assert.equal(
      await runtime.executeByReference(internal.testCustomers.whoAmI, {}, "garbage"),
      null,
    );
  });

  it("resolves the seeded user by tokenIdentifier", async () => {
    const identity = (await runtime.executeByReference(
      internal.testCustomers.whoAmI,
      {},
      VALID_TOKEN,
    )) as { tokenIdentifier: string };
    const client = await pool.connect();
    try {
      const res = await client.query('SELECT "_id" FROM "users" WHERE "tokenIdentifier" = $1', [
        identity.tokenIdentifier,
      ]);
      assert.equal(res.rows[0]?._id, userId);
    } finally {
      client.release();
    }
  });
});
