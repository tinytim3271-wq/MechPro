#!/usr/bin/env node
/**
 * Merge values into the mechpro/app Secrets Manager secret.
 *
 * Usage (PowerShell):
 *   $env:STRIPE_SECRET_KEY="sk_live_..."
 *   $env:STRIPE_WEBHOOK_SECRET="whsec_..."
 *   node aws/scripts/update-app-secrets.mjs
 *
 * Optional env vars: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, SES_FROM_EMAIL,
 * STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL
 */
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

const SECRET_ID = process.env.APP_SECRET_ID ?? "mechpro/app";
const REGION = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

const MERGE_KEYS = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_MONTHLY",
  "STRIPE_PRICE_ANNUAL",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "SES_FROM_EMAIL",
];

const client = new SecretsManagerClient({ region: REGION });

const current = await client.send(new GetSecretValueCommand({ SecretId: SECRET_ID }));
const parsed = JSON.parse(current.SecretString ?? "{}");

let changed = 0;
for (const key of MERGE_KEYS) {
  const value = process.env[key];
  if (!value || value === "REPLACE_ME") continue;
  if (parsed[key] !== value) {
    parsed[key] = value;
    changed++;
    console.log(`Updated ${key}`);
  }
}

if (changed === 0) {
  console.error("No env vars set to merge. Export STRIPE_SECRET_KEY, etc. and retry.");
  process.exit(1);
}

await client.send(
  new PutSecretValueCommand({
    SecretId: SECRET_ID,
    SecretString: JSON.stringify(parsed, null, 2),
  }),
);

console.log(`Saved ${changed} key(s) to ${SECRET_ID} (${REGION}).`);
