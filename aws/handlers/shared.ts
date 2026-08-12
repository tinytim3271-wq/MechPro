/**
 * Shared Lambda wiring: one Pool + Runtime per container, Cognito verifier,
 * S3 client, and HTTP helpers.
 */
import { S3Client } from "@aws-sdk/client-s3";
import { ConvexError } from "convex/values";
import pg from "pg";
import { createCognitoTokenVerifier } from "../runtime/cognito.ts";
import { loadEnv, type RuntimeEnv } from "../runtime/env.ts";
import { ensureSecrets } from "../runtime/secrets.ts";
// Imported from the generated registry so handlers share the same function map
// that the ported convex/ modules registered into.
import { Runtime } from "../generated/registry.ts";

export type ApiGatewayEvent = {
  rawPath?: string;
  path?: string;
  requestContext?: { http?: { method?: string; path?: string } };
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
};

export type ApiGatewayResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

let cached: { env: RuntimeEnv; pool: pg.Pool; runtime: Runtime } | undefined;
let initPromise: Promise<{ env: RuntimeEnv; pool: pg.Pool; runtime: Runtime }> | undefined;

export async function getRuntime(): Promise<{
  env: RuntimeEnv;
  pool: pg.Pool;
  runtime: Runtime;
}> {
  if (cached) return cached;
  if (!initPromise) initPromise = initRuntime();
  return initPromise;
}

async function initRuntime(): Promise<{ env: RuntimeEnv; pool: pg.Pool; runtime: Runtime }> {
  await ensureSecrets();
  const env = loadEnv();
  const local = /localhost|127\.0\.0\.1/.test(env.databaseUrl);
  const pool = new pg.Pool({
    connectionString: env.databaseUrl,
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Aurora presents a cert signed by Amazon's RDS CA, which is in the Lambda
    // trust store. Local Docker Postgres has no TLS.
    ssl: local ? undefined : { rejectUnauthorized: true },
  });

  const runtime = new Runtime({
    pool,
    verifyToken: createCognitoTokenVerifier({
      issuer: env.cognitoIssuer,
      clientId: env.cognitoClientId,
    }),
    storage: {
      bucket: env.s3Bucket,
      client: new S3Client({ region: env.region }),
    },
  });

  cached = { env, pool, runtime };
  return cached;
}

export function header(
  headers: Record<string, string | undefined> | undefined,
  name: string,
): string | undefined {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value;
  }
  return undefined;
}

export function readBody(event: ApiGatewayEvent): string {
  if (!event.body) return "";
  return event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
}

export function corsHeaders(frontendUrl: string): Record<string, string> {
  return {
    "access-control-allow-origin": frontendUrl,
    "access-control-allow-headers": "authorization,content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-max-age": "86400",
    "content-type": "application/json",
  };
}

export function json(
  statusCode: number,
  body: unknown,
  frontendUrl: string,
): ApiGatewayResult {
  return {
    statusCode,
    headers: corsHeaders(frontendUrl),
    body: JSON.stringify(body),
  };
}

export function errorResponse(err: unknown, frontendUrl: string): ApiGatewayResult {
  if (err instanceof ConvexError) {
    const data = err.data as { message?: string; code?: string } | string;
    if (typeof data === "string") {
      return json(400, { error: data, code: "BAD_REQUEST" }, frontendUrl);
    }
    const code = data.code ?? "BAD_REQUEST";
    const status =
      code === "UNAUTHENTICATED" ? 401 : code === "FORBIDDEN" ? 403 : code === "NOT_FOUND" ? 404 : 400;
    return json(status, { error: data.message ?? err.message, code }, frontendUrl);
  }
  const message = err instanceof Error ? err.message : String(err);
  if (message.startsWith("Function not found")) {
    return json(404, { error: message, code: "NOT_FOUND" }, frontendUrl);
  }
  console.error("Unhandled error", err);
  return json(500, { error: "Internal server error", code: "INTERNAL" }, frontendUrl);
}

export function requestPath(event: ApiGatewayEvent): string {
  return event.rawPath ?? event.requestContext?.http?.path ?? event.path ?? "/";
}
