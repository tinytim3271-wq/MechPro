/**
 * Runtime fidelity tests: these assert the Postgres implementation behaves the
 * way Convex does, because the ported functions in convex/ depend on those
 * exact semantics.
 *
 * Requires the local Postgres from `npm run db:up` + `npm run db:schema`.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { DatabaseWriter, generateId } from "./db.ts";

const CONNECTION = process.env.TEST_DATABASE_URL ?? "postgres://postgres:devpw@localhost:55433/mechpro";

let pool: pg.Pool;
let client: pg.PoolClient;
let db: DatabaseWriter;

let orgId: string;
let userId: string;
let customerId: string;

before(async () => {
  pool = new pg.Pool({ connectionString: CONNECTION });
  client = await pool.connect();
  db = new DatabaseWriter(client);

  // Clean slate. Truncating every table keeps runs independent.
  await client.query(`
    DO $$
    DECLARE t text;
    BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
      LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP;
    END $$;
  `);

  // Seed a tenant using raw SQL so the reference cycle can be deferred.
  await client.query("BEGIN");
  await client.query("SET CONSTRAINTS ALL DEFERRED");
  userId = generateId();
  orgId = generateId();
  await client.query(
    `INSERT INTO "users" ("_id","_creationTime","tokenIdentifier","currentOrgId","email")
     VALUES ($1,$2,$3,$4,$5)`,
    [userId, Date.now(), "https://auth.example.com|sub-1", orgId, "owner@example.com"],
  );
  await client.query(
    `INSERT INTO "organizations"
       ("_id","_creationTime","name","ownerId","taxRate","laborRate","bayCount","bayNames","isActive")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [orgId, Date.now(), "Test Shop", userId, 8.25, 120, 3, JSON.stringify(["Bay 1"]), true],
  );
  await client.query(
    `INSERT INTO "_idIndex" ("_id","tableName") VALUES ($1,'users'), ($2,'organizations')`,
    [userId, orgId],
  );
  await client.query("COMMIT");
});

after(async () => {
  client?.release();
  await pool?.end();
});

describe("insert / get", () => {
  it("round-trips a document and assigns _id and _creationTime", async () => {
    customerId = await db.insert("customers", {
      orgId,
      name: "Jane Doe",
      phone: "5125551234",
      email: "jane@example.com",
    });
    assert.ok(customerId.length > 0);

    const doc = await db.get(customerId);
    assert.ok(doc);
    assert.equal(doc._id, customerId);
    assert.equal(doc.name, "Jane Doe");
    assert.equal(typeof doc._creationTime, "number");
  });

  it("omits unset optional fields as undefined, not null (Convex semantics)", async () => {
    const doc = await db.get(customerId);
    assert.ok(doc);
    // `notes` was never set. Convex leaves it absent.
    assert.equal(doc.notes, undefined);
    assert.ok(!("notes" in doc), "unset optional column should be absent, not null");
  });

  it("returns null for an unknown id rather than throwing", async () => {
    assert.equal(await db.get(generateId()), null);
  });

  it("round-trips JSONB arrays and nested objects", async () => {
    const vehicleId = await db.insert("vehicles", {
      orgId, customerId, year: "2019", make: "Toyota", model: "Camry",
    });
    const roId = await db.insert("repairOrders", {
      orgId, roNumber: "RO-0001", customerId, vehicleId, isMobile: false,
      status: "estimate", priority: "normal", complaint: "Brake noise",
      laborLines: [{ description: "Front brakes", laborHours: 2, laborRate: 120 }],
      partLines: [], shopFees: [],
      subtotal: 240, taxAmount: 19.8, totalAmount: 259.8,
    });
    const ro = await db.get(roId);
    assert.ok(ro);
    const labor = ro.laborLines as { description: string; laborHours: number }[];
    assert.equal(labor.length, 1);
    assert.equal(labor[0].laborHours, 2);
    assert.equal(labor[0].description, "Front brakes");
  });
});

describe("query / withIndex", () => {
  before(async () => {
    for (const [i, name] of ["Alpha", "Bravo", "Charlie"].entries()) {
      await db.insert("customers", { orgId, name, phone: `50055512${i}0` });
    }
  });

  it("filters by an indexed equality", async () => {
    const rows = await db.query("customers").withIndex("by_org", (q) => q.eq("orgId", orgId)).collect();
    assert.equal(rows.length, 4); // Jane + 3
  });

  it("returns nothing for a non-matching index value", async () => {
    const rows = await db.query("customers").withIndex("by_org", (q) => q.eq("orgId", generateId())).collect();
    assert.equal(rows.length, 0);
  });

  it("orders ascending by default and honours order('desc')", async () => {
    const asc = await db.query("customers").withIndex("by_org_name", (q) => q.eq("orgId", orgId)).collect();
    const desc = await db.query("customers").withIndex("by_org_name", (q) => q.eq("orgId", orgId)).order("desc").collect();
    assert.deepEqual(
      asc.map((r) => r.name),
      ["Alpha", "Bravo", "Charlie", "Jane Doe"],
    );
    assert.deepEqual(desc.map((r) => r.name), asc.map((r) => r.name).reverse());
  });

  it("take() limits results", async () => {
    const rows = await db.query("customers").withIndex("by_org", (q) => q.eq("orgId", orgId)).take(2);
    assert.equal(rows.length, 2);
  });

  it("first() returns a single doc or null", async () => {
    const hit = await db.query("customers").withIndex("by_org", (q) => q.eq("orgId", orgId)).first();
    assert.ok(hit);
    const miss = await db.query("customers").withIndex("by_org", (q) => q.eq("orgId", generateId())).first();
    assert.equal(miss, null);
  });

  it("unique() returns the match", async () => {
    const u = await db.query("users").withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", "https://auth.example.com|sub-1")).unique();
    assert.ok(u);
    assert.equal(u._id, userId);
  });

  it("unique() throws when more than one row matches, as Convex does", async () => {
    await assert.rejects(
      () => db.query("customers").withIndex("by_org", (q) => q.eq("orgId", orgId)).unique(),
      /matched multiple documents/,
    );
  });

  it("supports a compound index using only its first field", async () => {
    const rows = await db.query("customers").withIndex("by_org_name", (q) => q.eq("orgId", orgId)).collect();
    assert.equal(rows.length, 4);
  });
});

describe("filter", () => {
  it("applies q.eq(q.field(...), value)", async () => {
    const rows = await db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.eq(q.field("name"), "Bravo"))
      .collect();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Bravo");
  });

  it("applies q.and(...) and q.or(...)", async () => {
    const or = await db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.or(q.eq(q.field("name"), "Alpha"), q.eq(q.field("name"), "Bravo")))
      .collect();
    assert.equal(or.length, 2);

    const and = await db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.and(q.eq(q.field("name"), "Alpha"), q.eq(q.field("orgId"), orgId)))
      .collect();
    assert.equal(and.length, 1);
  });

  it("treats an unset field as equal to undefined", async () => {
    const rows = await db
      .query("customers")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .filter((q) => q.eq(q.field("notes"), undefined))
      .collect();
    assert.equal(rows.length, 4);
  });
});

describe("patch / delete", () => {
  it("patch merges fields without clearing others", async () => {
    await db.patch(customerId, { notes: "VIP" });
    const doc = await db.get(customerId);
    assert.equal(doc?.notes, "VIP");
    assert.equal(doc?.name, "Jane Doe", "unrelated field must survive a patch");
  });

  it("patch can clear a field back to undefined", async () => {
    await db.patch(customerId, { notes: undefined });
    const doc = await db.get(customerId);
    assert.equal(doc?.notes, undefined);
  });

  it("patch on a missing document throws", async () => {
    await assert.rejects(() => db.patch(generateId(), { name: "x" }), /not found/);
  });

  it("delete removes the row and its id mapping", async () => {
    const tempId = await db.insert("customers", { orgId, name: "Temp" });
    await db.delete(tempId);
    assert.equal(await db.get(tempId), null);
    const idx = await client.query('SELECT 1 FROM "_idIndex" WHERE "_id" = $1', [tempId]);
    assert.equal(idx.rowCount, 0);
  });
});

describe("paginate", () => {
  it("walks all pages exactly once with no duplicates or gaps", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 10; guard++) {
      const res = await db
        .query("customers")
        .withIndex("by_org", (q) => q.eq("orgId", orgId))
        .paginate({ numItems: 2, cursor });
      seen.push(...res.page.map((r) => r._id));
      cursor = res.continueCursor;
      if (res.isDone) break;
    }
    assert.equal(seen.length, 4);
    assert.equal(new Set(seen).size, 4, "pagination must not repeat rows");
  });
});

describe("search index", () => {
  it("matches on a substring and respects the org filter", async () => {
    const hit = await db
      .query("customers")
      .withSearchIndex("search_email", (q) => q.search("email", "jane").eq("orgId", orgId))
      .collect();
    assert.equal(hit.length, 1);
    assert.equal(hit[0].email, "jane@example.com");

    const crossOrg = await db
      .query("customers")
      .withSearchIndex("search_email", (q) => q.search("email", "jane").eq("orgId", generateId()))
      .collect();
    assert.equal(crossOrg.length, 0, "search must not leak across orgs");
  });
});

describe("identifier safety", () => {
  it("rejects an unknown table instead of interpolating it into SQL", () => {
    assert.throws(() => db.query("customers; DROP TABLE users"), /Unknown table/);
  });

  it("rejects an unknown column in a filter", async () => {
    await assert.rejects(
      () => db.query("customers").filter((q) => q.eq(q.field('name" = \'x\' OR "1'), "y")).collect(),
      /Unknown column/,
    );
  });

  it("rejects an unknown index", () => {
    assert.throws(
      () => db.query("customers").withIndex("by_nonexistent", (q) => q.eq("orgId", orgId)),
      /Unknown index/,
    );
  });

  it("rejects an unknown column on insert", async () => {
    await assert.rejects(
      () => db.insert("customers", { orgId, name: "x", bogusColumn: 1 }),
      /Unknown column/,
    );
  });
});
