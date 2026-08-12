/**
 * API Gateway HTTP Lambda.
 *
 * Routes:
 *   OPTIONS /*              CORS preflight
 *   GET    /health          liveness
 *   POST   /api             run a public Convex function
 *                           body: { path: "module:export", args?: object }
 *   POST   /stripe-webhook  Stripe checkout.session.completed
 *
 * Public functions only — lookupPublic rejects internal* exports so the
 * audited internal surface cannot be called over HTTP.
 */
import { bearerToken } from "../runtime/auth.ts";
import { validateArgs } from "../runtime/validate.ts";
import {
  errorResponse,
  getRuntime,
  header,
  json,
  readBody,
  requestPath,
  type ApiGatewayEvent,
  type ApiGatewayResult,
} from "./shared.ts";
import { lookup, lookupPublic, Runtime } from "../generated/registry.ts";

type RunBody = {
  path?: unknown;
  args?: unknown;
};

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResult> {
  const { env, runtime } = await getRuntime();
  const method = (event.requestContext?.http?.method ?? "GET").toUpperCase();
  const path = requestPath(event);

  if (method === "OPTIONS") {
    return { statusCode: 204, headers: json(204, null, env.frontendUrl).headers, body: "" };
  }

  if (method === "GET" && (path === "/health" || path.endsWith("/health"))) {
    return json(200, { ok: true, service: "mechpro-api" }, env.frontendUrl);
  }

  try {
    if (method === "POST" && (path === "/api" || path.endsWith("/api"))) {
      return await runPublicFunction(runtime, event, env.frontendUrl);
    }
    if (method === "POST" && (path === "/stripe-webhook" || path.endsWith("/stripe-webhook"))) {
      return await stripeWebhook(runtime, event, env.frontendUrl);
    }
    return json(404, { error: "Not found", code: "NOT_FOUND" }, env.frontendUrl);
  } catch (err) {
    return errorResponse(err, env.frontendUrl);
  } finally {
    runtime.releaseBorrowed();
  }
}

async function runPublicFunction(
  runtime: Runtime,
  event: ApiGatewayEvent,
  frontendUrl: string,
): Promise<ApiGatewayResult> {
  let body: RunBody;
  try {
    body = JSON.parse(readBody(event) || "{}") as RunBody;
  } catch {
    return json(400, { error: "Invalid JSON body", code: "BAD_REQUEST" }, frontendUrl);
  }

  if (typeof body.path !== "string" || !body.path.includes(":")) {
    return json(
      400,
      { error: 'Body must include path like "module:function"', code: "BAD_REQUEST" },
      frontendUrl,
    );
  }

  const fn = lookupPublic(body.path);
  const args = validateArgs(
    fn.args as Record<string, unknown> | undefined,
    (body.args as Record<string, unknown> | undefined) ?? {},
  );
  const token = bearerToken(header(event.headers, "authorization"));

  const value = await runtime.execute(fn, args, token);
  return json(200, { value: value ?? null }, frontendUrl);
}

async function stripeWebhook(
  runtime: Runtime,
  event: ApiGatewayEvent,
  frontendUrl: string,
): Promise<ApiGatewayResult> {
  const signature = header(event.headers, "stripe-signature") ?? "";
  const body = readBody(event);

  // processStripeWebhook is internal — reachable here by path, not via /api.
  const fn = lookup("stripe:processStripeWebhook");
  await runtime.execute(fn, { body, signature }, null);

  return json(200, { received: true }, frontendUrl);
}
