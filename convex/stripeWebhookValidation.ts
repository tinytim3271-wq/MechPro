export const STRIPE_EVENT_MAX_AGE_SECONDS = 3 * 24 * 60 * 60;
export const STRIPE_EVENT_FUTURE_SKEW_SECONDS = 5 * 60;

export function stripeWebhookMutationAcceptance(result: {
  status: "recorded" | "duplicate" | "rejected";
  reason?: string;
}): { accepted: boolean; reason?: string } {
  if (result.status === "rejected") {
    return { accepted: false, reason: result.reason ?? "payment_rejected" };
  }
  return {
    accepted: true,
    ...(result.status === "duplicate" ? { reason: "duplicate" } : {}),
  };
}

export type StripeWebhookEnvelope = {
  eventId: string;
  eventCreated: number;
  eventType: string;
  sessionId: string;
  clientReferenceId: string;
  paymentStatus: string;
  currency: string;
  amountTotalCents: number;
  invoiceId: string;
  orgId: string;
  expectedAmountCents: string;
};

export function validateStripeWebhookEnvelope(
  args: StripeWebhookEnvelope,
  nowSeconds: number,
): { expectedAmountCents: number } | { reason: string } {
  if (!/^evt_[A-Za-z0-9_]+$/.test(args.eventId)) return { reason: "invalid_event_id" };
  if (!/^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(args.sessionId)) return { reason: "invalid_session_id" };
  if (!Number.isInteger(args.eventCreated)) return { reason: "invalid_event_time" };
  if (args.eventCreated < nowSeconds - STRIPE_EVENT_MAX_AGE_SECONDS) return { reason: "stale_event" };
  if (args.eventCreated > nowSeconds + STRIPE_EVENT_FUTURE_SKEW_SECONDS) return { reason: "future_event" };
  if (args.eventType !== "checkout.session.completed") return { reason: "invalid_event_type" };
  if (!args.invoiceId || args.clientReferenceId !== args.invoiceId) return { reason: "invalid_invoice_metadata" };
  if (!args.orgId) return { reason: "missing_shop_metadata" };
  if (!/^\d+$/.test(args.expectedAmountCents)) return { reason: "invalid_amount_metadata" };

  const expectedAmountCents = Number(args.expectedAmountCents);
  if (!Number.isSafeInteger(expectedAmountCents) || expectedAmountCents <= 0) {
    return { reason: "invalid_amount_metadata" };
  }
  if (!Number.isSafeInteger(args.amountTotalCents) || args.amountTotalCents <= 0) {
    return { reason: "invalid_payment_amount" };
  }
  if (args.paymentStatus !== "paid" || args.currency.toLowerCase() !== "usd") {
    return { reason: "invalid_payment_state" };
  }
  if (args.amountTotalCents !== expectedAmountCents) return { reason: "amount_metadata_mismatch" };

  return { expectedAmountCents };
}