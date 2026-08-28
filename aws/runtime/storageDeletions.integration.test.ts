import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import {
  claimStorageDeletions,
  ensureStorageDeletionSchema,
  STORAGE_DELETION_LEASE_MS,
} from "./storageDeletions.ts";

const CONNECTION = process.env.TEST_DATABASE_URL;

if (!CONNECTION) {
  throw new Error("TEST_DATABASE_URL is required for storage deletion integration tests");
}

let pool: pg.Pool;

before(async () => {
  pool = new pg.Pool({ connectionString: CONNECTION, max: 4 });
  const client = await pool.connect();
  try {
    await ensureStorageDeletionSchema(client);
  } finally {
    client.release();
  }
  await pool.query('TRUNCATE TABLE "_storageDeletions"');
});

after(async () => {
  await pool?.query('TRUNCATE TABLE "_storageDeletions"');
  await pool?.end();
});

async function insertDeletion(id: string, scheduledFor = Date.now() - 1): Promise<void> {
  await pool.query(
    `INSERT INTO "_storageDeletions"
       ("_id", "_creationTime", "bucket", "key", "scheduledFor", "state", "attempts")
     VALUES ($1, $2, 'test-bucket', $3, $4, 'pending', 0)`,
    [id, Date.now(), `objects/${id}`, scheduledFor],
  );
}

describe("storage deletion leases with real PostgreSQL concurrency", () => {
  it("gives concurrent workers distinct jobs through SKIP LOCKED", async () => {
    await insertDeletion("concurrent-a");
    await insertDeletion("concurrent-b");

    const firstClient = await pool.connect();
    const secondClient = await pool.connect();
    try {
      const [firstClaims, secondClaims] = await Promise.all([
        claimStorageDeletions(firstClient, 1),
        claimStorageDeletions(secondClient, 1),
      ]);

      assert.equal(firstClaims.length, 1);
      assert.equal(secondClaims.length, 1);
      assert.notEqual(firstClaims[0]._id, secondClaims[0]._id);

      const rows = await pool.query(
        `SELECT "_id", "state", "attempts", "leaseExpiresAt"
         FROM "_storageDeletions"
         ORDER BY "_id"`,
      );
      assert.deepEqual(rows.rows.map((row) => row.state), ["inProgress", "inProgress"]);
      assert.deepEqual(rows.rows.map((row) => row.attempts), [1, 1]);
      assert.ok(rows.rows.every((row) => row.leaseExpiresAt > Date.now()));
    } finally {
      firstClient.release();
      secondClient.release();
    }
  });

  it("does not reclaim a live lease and reclaims it after expiry", async () => {
    await pool.query('TRUNCATE TABLE "_storageDeletions"');
    await insertDeletion("leased-job");

    const firstClient = await pool.connect();
    const secondClient = await pool.connect();
    try {
      const [initialClaim] = await claimStorageDeletions(firstClient, 1);
      assert.equal(initialClaim._id, "leased-job");
      assert.deepEqual(await claimStorageDeletions(secondClient, 1), []);

      await pool.query(
        `UPDATE "_storageDeletions"
         SET "leaseExpiresAt" = $2
         WHERE "_id" = $1`,
        [initialClaim._id, Date.now() - STORAGE_DELETION_LEASE_MS],
      );

      const [reclaimed] = await claimStorageDeletions(secondClient, 1);
      assert.equal(reclaimed._id, initialClaim._id);
      assert.equal(reclaimed.attempts, 2);
    } finally {
      firstClient.release();
      secondClient.release();
    }
  });
});