import { S3Client } from "@aws-sdk/client-s3";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { Pool, type PoolClient, type PoolConfig } from "pg";
import {
  drainStorageDeletions,
  ensureStorageDeletionSchema,
} from "../runtime/storageDeletions.ts";

const DELETE_BATCH_SIZE = 100;

type DatabasePool = {
  connect(): Promise<PoolClient>;
};

type AuroraSecret = {
  host?: unknown;
  port?: unknown;
  dbname?: unknown;
  username?: unknown;
  password?: unknown;
};

export function parseAuroraSecret(secretString: string): PoolConfig {
  const secret = JSON.parse(secretString) as AuroraSecret;
  if (
    typeof secret.host !== "string" ||
    (typeof secret.port !== "string" && typeof secret.port !== "number") ||
    typeof secret.dbname !== "string" ||
    typeof secret.username !== "string" ||
    typeof secret.password !== "string"
  ) {
    throw new Error("Database secret is missing required Aurora connection fields");
  }
  const port = Number(secret.port);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error("Database secret contains an invalid port");
  }
  return {
    host: secret.host,
    port,
    database: secret.dbname,
    user: secret.username,
    password: secret.password,
    ssl: { rejectUnauthorized: false },
  };
}

export function createStorageDeletionHandler(pool: DatabasePool, s3: S3Client) {
  return async () => {
    const client = await pool.connect();
    try {
      await ensureStorageDeletionSchema(client);
      return await drainStorageDeletions(client, s3, DELETE_BATCH_SIZE);
    } finally {
      client.release();
    }
  };
}

let productionHandler: ReturnType<typeof createStorageDeletionHandler> | undefined;

async function getProductionHandler() {
  if (productionHandler) return productionHandler;
  const secretArn = process.env.DATABASE_SECRET_ARN;
  if (!secretArn) throw new Error("DATABASE_SECRET_ARN is required");
  const response = await new SecretsManagerClient({}).send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  if (!response.SecretString) throw new Error("Database secret has no SecretString value");
  productionHandler = createStorageDeletionHandler(
    new Pool(parseAuroraSecret(response.SecretString)),
    new S3Client({}),
  );
  return productionHandler;
}

export async function handler() {
  return (await getProductionHandler())();
}