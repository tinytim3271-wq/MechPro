/**
 * Cold-start secret hydration for Lambda.
 *
 * CDK injects DB_SECRET_ARN (RDS-generated) and APP_SECRET_ARN (Stripe/AI/…).
 * We materialise DATABASE_URL and the individual process.env keys the ported
 * convex/ modules already read (STRIPE_*, HERCULES_API_KEY, …).
 */
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

let hydrated = false;

type RdsSecret = {
  username?: string;
  password?: string;
  host?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
  engine?: string;
};

export async function ensureSecrets(): Promise<void> {
  if (hydrated) return;
  if (process.env.DATABASE_URL && !process.env.DB_SECRET_ARN) {
    hydrated = true;
    return;
  }

  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";
  const client = new SecretsManagerClient({ region });

  if (process.env.DB_SECRET_ARN && !process.env.DATABASE_URL) {
    const raw = await getSecretString(client, process.env.DB_SECRET_ARN);
    const parsed = JSON.parse(raw) as RdsSecret;
    const user = encodeURIComponent(parsed.username ?? "");
    const pass = encodeURIComponent(parsed.password ?? "");
    const host = parsed.host ?? "localhost";
    const port = parsed.port ?? 5432;
    const db = parsed.dbname ?? parsed.database ?? "mechpro";
    process.env.DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
  }

  if (process.env.APP_SECRET_ARN) {
    const raw = await getSecretString(client, process.env.APP_SECRET_ARN);
    const parsed = JSON.parse(raw) as Record<string, string>;
    for (const [key, value] of Object.entries(parsed)) {
      if (value && value !== "REPLACE_ME" && !process.env[key]) {
        process.env[key] = value;
      }
    }
    // AI modules still read HERCULES_API_KEY; prefer OPENAI_API_KEY when set.
    if (process.env.OPENAI_API_KEY && !process.env.HERCULES_API_KEY) {
      process.env.HERCULES_API_KEY = process.env.OPENAI_API_KEY;
    }
  }

  hydrated = true;
}

async function getSecretString(client: SecretsManagerClient, arn: string): Promise<string> {
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }));
  if (!res.SecretString) throw new Error(`Secret ${arn} has no SecretString`);
  return res.SecretString;
}
