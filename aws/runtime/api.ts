/**
 * Drop-in replacement for convex/_generated/api.
 *
 * Convex generates this file as `export const api = anyApi`, a Proxy that turns
 * property access into a function path. The runtime's reference proxy does the
 * same thing, so `internal.email.sendInvoiceEmail` keeps working unchanged.
 */
export { api, internal } from "./functions.ts";
