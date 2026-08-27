import { S3Client } from "@aws-sdk/client-s3";
import { Pool, type PoolClient } from "pg";
import { drainStorageDeletions } from "../runtime/storageDeletions.ts";

const DELETE_BATCH_SIZE = 100;

type DatabasePool = {
  connect(): Promise<PoolClient>;
};

export function createStorageDeletionHandler(pool: DatabasePool, s3: S3Client) {
  return async () => {
    const client = await pool.connect();
    try {
      return await drainStorageDeletions(client, s3, DELETE_BATCH_SIZE);
    } finally {
      client.release();
    }
  };
}

let productionHandler: ReturnType<typeof createStorageDeletionHandler> | undefined;

export async function handler() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  productionHandler ??= createStorageDeletionHandler(
    new Pool({ connectionString: databaseUrl }),
    new S3Client({}),
  );
  return productionHandler();
}