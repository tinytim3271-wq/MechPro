import { ConvexReactClient } from "convex/react";

export const convexUrl =
  import.meta.env.VITE_CONVEX_URL ?? "http://localhost:3000";

export const useAwsBackend =
  import.meta.env.VITE_USE_AWS === "true" ||
  (Boolean(convexUrl) &&
    /^https?:\/\//.test(convexUrl) &&
    !convexUrl.includes(".convex.cloud") &&
    !convexUrl.includes("localhost:3"));

/** Real Convex client — unused when the AWS alias is active. */
export const convex = useAwsBackend
  ? (null as unknown as ConvexReactClient)
  : new ConvexReactClient(convexUrl);
