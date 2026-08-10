/**
 * ctx.storage — S3 replacement for Convex file storage.
 *
 * Used by inspection photos, RO photos and tech recommendations. Convex hands
 * out an upload URL that the browser POSTs to and which returns a storage id;
 * S3 presigned PUT URLs behave differently, so the upload id is allocated up
 * front and returned alongside the URL. The one client-side consequence is
 * handled in the client compat layer rather than in each page.
 */
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PoolClient } from "pg";
import { generateId } from "./db.ts";

const UPLOAD_URL_TTL_SECONDS = 60 * 15;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export type StorageConfig = {
  bucket: string;
  client: S3Client;
};

export type UploadTarget = {
  /** Presigned S3 PUT URL. */
  url: string;
  /** Storage id to send back to the mutation that records the file. */
  storageId: string;
};

export type UploadPolicy = {
  contentType: string;
  size: number;
  kind: string;
};

export class Storage {
  private readonly client: PoolClient;
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor(client: PoolClient, config: StorageConfig) {
    this.client = client;
    this.s3 = config.client;
    this.bucket = config.bucket;
  }

  /**
   * Allocates a storage id and returns a presigned PUT URL for it. The row is
   * written now so the id is a valid foreign key target the moment the caller's
   * mutation records it; contentType and size are backfilled on first read.
   */
  async generateUploadUrl(policy?: UploadPolicy): Promise<UploadTarget> {
    const storageId = generateId();
    const key = `uploads/${storageId}`;

    await this.client.query(
      `INSERT INTO "_storage" ("_id","_creationTime","bucket","key","contentType","size") VALUES ($1,$2,$3,$4,$5,$6)`,
      [storageId, Date.now(), this.bucket, key, policy?.contentType ?? null, policy?.size ?? null],
    );

    const url = await getSignedUrl(
      this.s3,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: policy?.contentType,
        ContentLength: policy?.size,
        Metadata: policy ? { uploadKind: policy.kind } : undefined,
      }),
      { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );

    return { url, storageId };
  }

  /** Presigned GET URL, or null when the id is unknown — matching Convex. */
  async getUrl(storageId: string | null | undefined): Promise<string | null> {
    if (!storageId) return null;
    const res = await this.client.query(
      'SELECT "bucket","key" FROM "_storage" WHERE "_id" = $1',
      [storageId],
    );
    const row = res.rows[0] as { bucket: string; key: string } | undefined;
    if (!row) return null;

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: row.bucket, Key: row.key }),
      { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
    );
  }

  async delete(storageId: string | null | undefined): Promise<void> {
    if (!storageId) return;
    const res = await this.client.query(
      'SELECT "bucket","key" FROM "_storage" WHERE "_id" = $1',
      [storageId],
    );
    const row = res.rows[0] as { bucket: string; key: string } | undefined;
    if (!row) return;

    await this.s3.send(new DeleteObjectCommand({ Bucket: row.bucket, Key: row.key }));
    await this.client.query('DELETE FROM "_storage" WHERE "_id" = $1', [storageId]);
  }
}
