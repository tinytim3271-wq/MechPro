import { describe, expect, test } from "vitest";
import {
  STRIPE_EVENT_FUTURE_SKEW_SECONDS,
  STRIPE_EVENT_MAX_AGE_SECONDS,
  validateStripeWebhookEnvelope,
  type StripeWebhookEnvelope,
} from "./stripeWebhookValidation";

const NOW_SECONDS = 1_800_000_000;

function validEnvelope(overrides: Partial<StripeWebhookEnvelope> = {}): StripeWebhookEnvelope {
  return {
    eventId: "evt_123456789",
    eventCreated: NOW_SECONDS,
    eventType: "checkout.session.completed",
    sessionId: "cs_test_123456789",
    clientReferenceId: "invoice_123",
    paymentStatus: "paid",
    currency: "usd",
    amountTotalCents: 10_825,
    invoiceId: "invoice_123",
    orgId: "shop_123",
    expectedAmountCents: "10825",
    ...overrides,
  };
}

function reasonFor(overrides: Partial<StripeWebhookEnvelope>): string | undefined {
  const result = validateStripeWebhookEnvelope(validEnvelope(overrides), NOW_SECONDS);
  return "reason" in result ? result.reason : undefined;
}

describe("Stripe webhook envelope validation", () => {
  test("accepts a fresh, shop-routed invoice payment", () => {
    expect(validateStripeWebhookEnvelope(validEnvelope(), NOW_SECONDS)).toEqual({
      expectedAmountCents: 10_825,
    });
  });

  test.each([
    [{ eventId: "bad" }, "invalid_event_id"],
    [{ sessionId: "bad" }, "invalid_session_id"],
    [{ eventType: "payment_intent.succeeded" }, "invalid_event_type"],
    [{ clientReferenceId: "another_invoice" }, "invalid_invoice_metadata"],
    [{ orgId: "" }, "missing_shop_metadata"],
    [{ expectedAmountCents: "10.825" }, "invalid_amount_metadata"],
    [{ amountTotalCents: 1 }, "amount_metadata_mismatch"],
    [{ paymentStatus: "unpaid" }, "invalid_payment_state"],
    [{ currency: "eur" }, "invalid_payment_state"],
  ] as const)("rejects invalid identity or metadata with %s", (overrides, reason) => {
    expect(reasonFor(overrides)).toBe(reason);
  });

  test("rejects events older than Stripe's retry horizon", () => {
    expect(reasonFor({ eventCreated: NOW_SECONDS - STRIPE_EVENT_MAX_AGE_SECONDS - 1 })).toBe(
      "stale_event",
    );
  });

  test("rejects event timestamps beyond the clock-skew allowance", () => {
    expect(reasonFor({ eventCreated: NOW_SECONDS + STRIPE_EVENT_FUTURE_SKEW_SECONDS + 1 })).toBe(
      "future_event",
    );
  });
});