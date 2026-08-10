/**
 * Environment / secrets contract for MechPro Lambda handlers.
 *
 * Required at runtime (injected by CDK from Secrets Manager / stack outputs):
 *   DATABASE_URL          Aurora Postgres connection string
 *   COGNITO_ISSUER        https://cognito-idp.{region}.amazonaws.com/{userPoolId}
 *   COGNITO_CLIENT_ID     App client id used by the SPA
 *   S3_BUCKET             Uploads bucket name
 *   AWS_REGION            Set automatically by Lambda; used for S3 + JWKS
 *
 * Required for payment / product features (Secrets Manager):
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET
 *   FRONTEND_URL          Public SPA origin (CORS + Stripe redirects)
 *
 * Hercules replacements (set when cutting over each service):
 *   OPENAI_API_KEY        Direct OpenAI (or Bedrock proxy) — replaces HERCULES_API_KEY AI gateway
 *   SES_FROM_EMAIL        Verified SES identity — replaces hercules.email
 *   VAPID_PUBLIC_KEY      Web Push — replaces hercules.pushNotifications
 *   VAPID_PRIVATE_KEY
 *
 * Legacy aliases still read so ported convex/ modules keep working unchanged:
 *   HERCULES_API_KEY      Fall-through for AI/email/push until those modules are rewritten
 */

export type RuntimeEnv = {
  databaseUrl: string;
  cognitoIssuer: string;
  cognitoClientId: string;
  s3Bucket: string;
  region: string;
  frontendUrl: string;
  stripeSecretKey: string | undefined;
  stripeWebhookSecret: string | undefined;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadEnv(): RuntimeEnv {
  return {
    databaseUrl: required("DATABASE_URL"),
    cognitoIssuer: required("COGNITO_ISSUER"),
    cognitoClientId: required("COGNITO_CLIENT_ID"),
    s3Bucket: required("S3_BUCKET"),
    region: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1",
    frontendUrl: process.env.FRONTEND_URL ?? "https://yourcarguy806.com",
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  };
}
