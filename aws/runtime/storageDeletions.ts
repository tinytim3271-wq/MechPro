import { DeleteObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { PoolClient } from "pg";

export type StorageDeletion = {
  _id: string;
  bucket: string;
  key: string;
  attempts: number;
};

const MAX_ATTEMPTS = 8;
export const STORAGE_DELETION_LEASE_MS = 5 * 60 * 1000;

export async function ensureStorageDeletionSchema(client: PoolClient): Promise<void> {
  await client.query(`
CREATE TABLE IF NOT EXISTS "_storageDeletions" (
  "_id" TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "bucket" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "scheduledFor" DOUBLE PRECISION NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending'
    CHECK ("state" IN ('pending','inProgress','failed')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "leaseExpiresAt" DOUBLE PRECISION
);
ALTER TABLE "_storageDeletions"
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "_storageDeletions_due"
  ON "_storageDeletions" ("state", "scheduledFor");
`);
}

export async function claimStorageDeletions(
  client: PoolClient,
  limit = 25,
): Promise<StorageDeletion[]> {
  const now = Date.now();
  const result = await client.query(
    `UPDATE "_storageDeletions"
     SET "state" = 'inProgress', "attempts" = "attempts" + 1, "leaseExpiresAt" = $2
     WHERE "_id" IN (
       SELECT "_id" FROM "_storageDeletions"
       WHERE ("state" = 'pending' AND "scheduledFor" <= $1)
          OR ("state" = 'inProgress' AND ("leaseExpiresAt" IS NULL OR "leaseExpiresAt" <= $1))
       ORDER BY "scheduledFor"
       LIMIT $3
       FOR UPDATE SKIP LOCKED
     )
     RETURNING "_id","bucket","key","attempts"`,
    [now, now + STORAGE_DELETION_LEASE_MS, limit],
  );
  return result.rows as StorageDeletion[];
}

export async function executeStorageDeletion(
  s3: S3Client,
  deletion: StorageDeletion,
): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: deletion.bucket, Key: deletion.key }));
}

export async function markStorageDeletionSucceeded(
  client: PoolClient,
  deletionId: string,
): Promise<void> {
  await client.query('DELETE FROM "_storageDeletions" WHERE "_id" = $1', [deletionId]);
}

export async function markStorageDeletionFailed(
  client: PoolClient,
  deletion: StorageDeletion,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const giveUp = deletion.attempts >= MAX_ATTEMPTS;
  const backoffMs = Math.min(2 ** deletion.attempts * 1000, 15 * 60 * 1000);
  await client.query(
    `UPDATE "_storageDeletions"
      SET "state" = $2, "lastError" = $3, "scheduledFor" = $4, "leaseExpiresAt" = NULL
     WHERE "_id" = $1`,
    [
      deletion._id,
      giveUp ? "failed" : "pending",
      message,
      giveUp ? Date.now() : Date.now() + backoffMs,
    ],
  );
}

export async function drainStorageDeletions(
  client: PoolClient,
  s3: S3Client,
  limit = 25,
): Promise<{ succeeded: number; failed: number }> {
  const deletions = await claimStorageDeletions(client, limit);
  let succeeded = 0;
  let failed = 0;
  for (const deletion of deletions) {
    try {
      await executeStorageDeletion(s3, deletion);
      await markStorageDeletionSucceeded(client, deletion._id);
      succeeded += 1;
    } catch (error) {
      await markStorageDeletionFailed(client, deletion, error);
      failed += 1;
    }
  }
  return { succeeded, failed };
}