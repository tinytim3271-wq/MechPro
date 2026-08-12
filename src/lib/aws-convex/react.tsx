/**
 * Drop-in replacement for `convex/react` when the SPA talks to the AWS API.
 *
 * Activated via Vite alias when `VITE_USE_AWS=true` (see vite.config.ts).
 * Provides polling queries + HTTP mutations/actions against POST /api.
 */
export {
  AwsConvexProviderWithAuth as ConvexProviderWithAuth,
  useConvexAuth,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "./provider.tsx";
export { useQuery, useMutation, useAction } from "./hooks.ts";

/** Unused on AWS — kept so accidental imports don't break the build. */
export class ConvexReactClient {
  constructor(_url: string) {}
}
