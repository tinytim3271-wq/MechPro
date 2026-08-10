import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "./_generated/server.d.ts";

const getExternalAiPolicy = makeFunctionReference<
  "query",
  Record<string, never>,
  { enabled: boolean } | null
>("aiPolicy:getExternalAiPolicy");

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]"],
  [/(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g, "[REDACTED_PHONE]"],
  [/(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, "[REDACTED_SSN]"],
  [/(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g, "[REDACTED_PAYMENT_CARD]"],
  [/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[REDACTED_VIN]"],
];

export function redactExternalAiText(value: string): string {
  return REDACTIONS.reduce(
    (redacted, [pattern, replacement]) => redacted.replace(pattern, replacement),
    value,
  );
}

export async function requireExternalAiConsent(ctx: ActionCtx): Promise<void> {
  const policy = await ctx.runQuery(getExternalAiPolicy, {});
  if (!policy?.enabled) {
    throw new ConvexError({
      message: "External AI processing is disabled for this organization",
      code: "FORBIDDEN",
    });
  }
}