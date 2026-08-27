import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";
import { createStorageDeletionHandler } from "../functions/storageDeletionWorker.ts";
import { Storage } from "./storage.ts";
import {
  claimStorageDeletions,
  executeStorageDeletion,
  markStorageDeletionFailed,
  markStorageDeletionSucceeded,
  type StorageDeletion,
} from "./storageDeletions.ts";

type State = {
  metadata: Map<string, { bucket: string; key: string }>;
  deletions: Map<string, StorageDeletion & {
    state: string;
    scheduledFor: number;
    leaseExpiresAt?: number;
  }>;
};

function copyState(state: State): State {
  return {
    metadata: new Map(state.metadata),
    deletions: new Map([...state.deletions].map(([id, value]) => [id, { ...value }])),
  };
}

class TransactionalClient {
  state: State = {
    metadata: new Map([["storage-1", { bucket: "test-bucket", key: "uploads/storage-1" }]]),
    deletions: new Map(),
  };
  private transaction: State | null = null;
  failCommit = false;

  async query(sql: string, values: unknown[] = []) {
    if (sql === "BEGIN") {
      this.transaction = copyState(this.state);
      return { rows: [] };
    }
    if (sql === "ROLLBACK") {
      this.transaction = null;
      return { rows: [] };
    }
    if (sql === "COMMIT") {
      if (this.failCommit) {
        this.transaction = null;
        throw new Error("commit failed");
      }
      if (this.transaction) this.state = this.transaction;
      this.transaction = null;
      return { rows: [] };
    }

    const state = this.transaction ?? this.state;
    if (sql.startsWith("SELECT") && sql.includes('FROM "_storage"')) {
      const row = state.metadata.get(String(values[0]));
      return { rows: row ? [row] : [] };
    }
    if (sql.includes('INSERT INTO "_storageDeletions"')) {
      const [id, , bucket, key, scheduledFor] = values;
      state.deletions.set(String(id), {
        _id: String(id),
        bucket: String(bucket),
        key: String(key),
        scheduledFor: Number(scheduledFor),
        state: "pending",
        attempts: 0,
      });
      return { rows: [] };
    }
    if (sql.startsWith('DELETE FROM "_storage"')) {
      state.metadata.delete(String(values[0]));
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE "_storageDeletions"') && sql.includes("RETURNING")) {
      const jobs = [...state.deletions.values()]
        .filter((job) => (
          (job.state === "pending" && job.scheduledFor <= Number(values[0]))
          || (job.state === "inProgress"
            && (job.leaseExpiresAt === undefined || job.leaseExpiresAt <= Number(values[0])))
        ))
        .slice(0, Number(values[2]));
      for (const job of jobs) {
        job.state = "inProgress";
        job.attempts += 1;
        job.leaseExpiresAt = Number(values[1]);
      }
      return { rows: jobs.map(({ _id, bucket, key, attempts }) => ({ _id, bucket, key, attempts })) };
    }
    if (sql.startsWith('DELETE FROM "_storageDeletions"')) {
      state.deletions.delete(String(values[0]));
      return { rows: [] };
    }
    if (sql.startsWith('UPDATE "_storageDeletions"')) {
      const job = state.deletions.get(String(values[0]));
      if (job) {
        job.state = String(values[1]);
        job.scheduledFor = Number(values[3]);
        job.leaseExpiresAt = undefined;
      }
      return { rows: [] };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  }
}

function createFixture() {
  const client = new TransactionalClient();
  const s3Calls: string[] = [];
  const s3 = {
    send: async () => {
      s3Calls.push("delete");
      return {};
    },
  } as unknown as S3Client;
  const storage = new Storage(client as unknown as PoolClient, {
    bucket: "test-bucket",
    client: s3,
  });
  return { client, s3, s3Calls, storage };
}

describe("storage deletion outbox", () => {
  it("preserves metadata and queues no cleanup when the mutation rolls back", async () => {
    const { client, s3Calls, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await client.query("ROLLBACK");

    assert.equal(client.state.metadata.has("storage-1"), true);
    assert.equal(client.state.deletions.size, 0);
    assert.deepEqual(s3Calls, []);
  });

  it("preserves metadata and queues no cleanup when commit fails", async () => {
    const { client, s3Calls, storage } = createFixture();
    client.failCommit = true;
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await assert.rejects(() => client.query("COMMIT"), /commit failed/);

    assert.equal(client.state.metadata.has("storage-1"), true);
    assert.equal(client.state.deletions.size, 0);
    assert.deepEqual(s3Calls, []);
  });

  it("deletes S3 only after committed metadata removal", async () => {
    const { client, s3, s3Calls, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    assert.deepEqual(s3Calls, []);
    await client.query("COMMIT");

    assert.equal(client.state.metadata.has("storage-1"), false);
    const [job] = await claimStorageDeletions(client as unknown as PoolClient);
    assert.ok(job);
    await executeStorageDeletion(s3, job);
    await markStorageDeletionSucceeded(client as unknown as PoolClient, job._id);
    assert.deepEqual(s3Calls, ["delete"]);
    assert.equal(client.state.deletions.size, 0);
  });

  it("returns a failed S3 cleanup to the retry queue", async () => {
    const { client, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await client.query("COMMIT");
    const [job] = await claimStorageDeletions(client as unknown as PoolClient);

    await markStorageDeletionFailed(client as unknown as PoolClient, job, new Error("S3 unavailable"));
    assert.equal(client.state.deletions.get(job._id)?.state, "pending");
    assert.equal(client.state.metadata.has("storage-1"), false);
  });

  it("reclaims an in-progress deletion after its worker lease expires", async () => {
    const { client, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await client.query("COMMIT");
    const [abandoned] = await claimStorageDeletions(client as unknown as PoolClient);
    const claimedState = client.state.deletions.get(abandoned._id);
    assert.equal(claimedState?.state, "inProgress");
    assert.ok(claimedState?.leaseExpiresAt);

    assert.deepEqual(await claimStorageDeletions(client as unknown as PoolClient), []);
    claimedState!.leaseExpiresAt = Date.now() - 1;
    const [reclaimed] = await claimStorageDeletions(client as unknown as PoolClient);

    assert.equal(reclaimed._id, abandoned._id);
    assert.equal(reclaimed.attempts, 2);
  });

  it("reclaims legacy in-progress deletions without a lease", async () => {
    const { client, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await client.query("COMMIT");
    const legacyJob = [...client.state.deletions.values()][0];
    legacyJob.state = "inProgress";
    legacyJob.leaseExpiresAt = undefined;

    const [reclaimed] = await claimStorageDeletions(client as unknown as PoolClient);

    assert.equal(reclaimed._id, legacyJob._id);
    assert.equal(reclaimed.attempts, 1);
  });

  it("drains committed deletion jobs through the scheduled worker handler", async () => {
    const { client, s3, s3Calls, storage } = createFixture();
    await client.query("BEGIN");
    await storage.delete("storage-1");
    await client.query("COMMIT");
    let released = false;
    const pool = {
      connect: async () => {
        Object.assign(client, { release: () => { released = true; } });
        return client as unknown as PoolClient;
      },
    };

    const result = await createStorageDeletionHandler(pool, s3)();

    assert.deepEqual(result, { succeeded: 1, failed: 0 });
    assert.deepEqual(s3Calls, ["delete"]);
    assert.equal(client.state.deletions.size, 0);
    assert.equal(released, true);
  });
});