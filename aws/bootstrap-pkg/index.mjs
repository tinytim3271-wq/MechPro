/**
 * One-shot Lambda handler: apply schema.sql using DB_SECRET_ARN.
 * Deployed temporarily to bootstrap private Aurora from inside the VPC.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));

export async function handler() {
  const arn = process.env.DB_SECRET_ARN;
  if (!arn) throw new Error("DB_SECRET_ARN is required");

  const sm = new SecretsManagerClient({});
  const res = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
  const db = JSON.parse(res.SecretString ?? "{}");
  const url = `postgresql://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}@${db.host}:${db.port}/${db.dbname ?? db.database ?? "mechpro"}`;

  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    return { ok: true, message: "Schema applied successfully." };
  } finally {
    await client.end();
  }
}
