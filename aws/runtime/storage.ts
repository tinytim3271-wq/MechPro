/**
 * ctx.storage — S3 replacement for Convex file storage.
 *
 * Convex hands the browser a single upload URL string. The browser POSTs the
 * file body and parses `{ storageId }` from the JSON response. We mirror that
 * contract with a short-lived signed `POST /upload` URL on the HTTP API; the
 * handler streams the body into S3 and returns the pre-allocated storage id.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PoolClient } from "pg";
import { generateId } from "./db.ts";

const UPLOAD_URL_TTL_SECONDS = 60 * 15;
const DOWNLOAD_URL_TTL_SECONDS = 60 * 60;

export type StorageConfig = {
  bucket: string;
  client: S3Client;
  /** Public API base URL used to mint Convex-compatible upload URLs. */
  apiPublicUrl?: string;
  /** HMAC secret for upload URL signatures (falls back to bucket name). */
  uploadSigningSecret?: string;
};

export class Storage {
  private readonly client: PoolClient;
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly apiPublicUrl: string | undefined;
  private readonly signingSecret: string;

  constructor(client: PoolClient, config: StorageConfig) {
    this.client = client;
    this.s3 = config.client;
    this.bucket = config.bucket;
    this.apiPublicUrl = config.apiPublicUrl?.replace(/\/$/, "");
    this.signingSecret = config.uploadSigningSecret || config.bucket;
  }

  /**
   * Allocates a storage id and returns a Convex-compatible upload URL string.
   * The browser POSTs the raw file to that URL and receives `{ storageId }`.
   */
  async generateUploadUrl(): Promise<string> {
    const storageId = generateId();
    const key = `uploads/${storageId}`;
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_URL_TTL_SECONDS;
    const sig = signUpload(this.signingSecret, storageId, exp);

    await this.client.query(
      `INSERT INTO "_storage" ("_id","_creationTime","bucket","key") VALUES ($1,$2,$3,$4)`,
      [storageId, Date.now(), this.bucket, key],
    );

    if (!this.apiPublicUrl) {
      // Local/dev fallback: return a presigned S3 PUT (not Convex-compatible).
      return getSignedUrl(
        this.s3,
        new PutObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
      );
    }

    const url = new URL(`${this.apiPublicUrl}/upload`);
    url.searchParams.set("id", storageId);
    url.searchParams.set("exp", String(exp));
    url.searchParams.set("sig", sig);
    return url.toString();
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

  /** Used by the HTTP /upload handler after signature verification. */
  async finalizeUpload(
    storageId: string,
    body: Buffer,
    contentType: string | undefined,
  ): Promise<string> {
    const res = await this.client.query(
      'SELECT "bucket","key" FROM "_storage" WHERE "_id" = $1',
      [storageId],
    );
    const row = res.rows[0] as { bucket: string; key: string } | undefined;
    if (!row) throw new Error("Unknown storage id");

    await this.s3.send(
      new PutObjectCommand({
        Bucket: row.bucket,
        Key: row.key,
        Body: body,
        ContentType: contentType || "application/octet-stream",
      }),
    );

    await this.client.query(
      `UPDATE "_storage" SET "contentType" = $2, "size" = $3 WHERE "_id" = $1`,
      [storageId, contentType || "application/octet-stream", body.length],
    );

    return storageId;
  }
}

export function signUpload(secret: string, storageId: string, exp: number): string {
  return createHmac("sha256", secret).update(`${storageId}:${exp}`).digest("base64url");
}

export function verifyUploadSignature(
  secret: string,
  storageId: string,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = signUpload(secret, storageId, exp);
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
