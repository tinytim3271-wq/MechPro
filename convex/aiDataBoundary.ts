import { ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "./_generated/server.d.ts";

const getExternalAiPolicy = makeFunctionReference<
  "query",
  Record<string, never>,
  { enabled: boolean; auditRetentionDays: number } | null
>("aiPolicy:getExternalAiPolicy");

const recordExternalAiAudit = makeFunctionReference<
  "mutation",
  { operation: string; retentionDays: number },
  null
>("aiPolicy:recordExternalAiAudit");

const REDACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]"],
  [/(?<!\d)(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)/g, "[REDACTED_PHONE]"],
  [/(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g, "[REDACTED_SSN]"],
  [/(?<!\d)(?:\d[ -]*?){13,19}(?!\d)/g, "[REDACTED_PAYMENT_CARD]"],
  [/\b[A-HJ-NPR-Z0-9]{17}\b/gi, "[REDACTED_VIN]"],
  [/\b(?:customer|owner|contact|name)\s*[:=-]\s*[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+){1,3}\b/gi, "[REDACTED_NAME]"],
  [/\b\d{1,6}\s+(?:[A-Z0-9.'-]+\s+){0,5}(?:STREET|ST|AVENUE|AVE|ROAD|RD|BOULEVARD|BLVD|DRIVE|DR|LANE|LN|COURT|CT|PARKWAY|PKWY|HIGHWAY|HWY)\b(?:\s+(?:APT|UNIT|SUITE|#)\s*[A-Z0-9-]+)?/gi, "[REDACTED_ADDRESS]"],
  [/\b(?:license\s+plate|plate|tag)\s*[:=-]\s*[A-Z0-9][A-Z0-9 -]{1,9}\b/gi, "[REDACTED_LICENSE_PLATE]"],
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
  await ctx.runMutation(recordExternalAiAudit, {
    operation: "external_ai_request",
    retentionDays: policy.auditRetentionDays,
  });
}