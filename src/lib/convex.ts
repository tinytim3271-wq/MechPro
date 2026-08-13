import { ConvexReactClient } from "convex/react";
import { AwsConvexClient } from "./aws-convex-client.ts";

export const convexUrl =
  import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";

export const useAwsBackend =
  import.meta.env.VITE_USE_AWS === "true" ||
  (Boolean(convexUrl) &&
    /^https?:\/\//.test(convexUrl) &&
    !convexUrl.includes(".convex.cloud") &&
    !convexUrl.includes("localhost:3"));

/**
 * When running against the AWS backend, use the HTTP-polling client that
 * routes queries/mutations through POST /api.  Otherwise use the real
 * Convex WebSocket client.
 */
export const convex = useAwsBackend
  ? (new AwsConvexClient(convexUrl) as unknown as ConvexReactClient)
  : new ConvexReactClient(convexUrl);
