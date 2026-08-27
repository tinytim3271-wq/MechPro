import Stripe from "stripe";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "./_generated/dataModel.d.ts";
import schema from "./schema";
import * as invoiceTechPay from "./invoiceTechPay";
import {
  STRIPE_EVENT_FUTURE_SKEW_SECONDS,
  STRIPE_EVENT_MAX_AGE_SECONDS,
  stripeWebhookMutationAcceptance,
  validateStripeWebhookEnvelope,
  type StripeWebhookEnvelope,
} from "./stripeWebhookValidation";

const NOW_SECONDS = 1_800_000_000;
const WEBHOOK_SECRET = "whsec_test_webhook_secret";
const modules = import.meta.glob("./**/*.*s");

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function setupPayableInvoice(t: ReturnType<typeof convexTest>) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { tokenIdentifier: "stripe-owner", name: "Owner" });
    const orgId = await ctx.db.insert("organizations", {
      name: "Stripe Shop",
      ownerId: userId,
      taxRate: 0,
      laborRate: 100,
      bayCount: 1,
      bayNames: ["Bay 1"],
      isActive: true,
    });
    const customerId = await ctx.db.insert("customers", { orgId, name: "Customer", phone: "555-0100" });
    const memberId = await ctx.db.insert("orgMembers", {
      orgId,
      userId,
      role: "owner",
      isActive: true,
    });
    const vehicleId = await ctx.db.insert("vehicles", {
      orgId,
      customerId,
      year: "2020",
      make: "Toyota",
      model: "Camry",
    });
    const roId = await ctx.db.insert("repairOrders", {
      orgId,
      customerId,
      vehicleId,
      roNumber: "RO-STRIPE",
      status: "invoiced",
      priority: "normal",
      complaint: "Payment test",
      isMobile: false,
      laborLines: [{ description: "Labor", laborHours: 1, laborRate: 100 }],
      partLines: [],
      shopFees: [],
      subtotal: 100,
      taxAmount: 0,
      totalAmount: 100,
      assignedTo: memberId,
    });
    const invoiceId = await ctx.db.insert("invoices", {
      orgId,
      roId,
      customerId,
      invoiceNumber: "INV-STRIPE",
      status: "sent",
      issuedAt: new Date().toISOString(),
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      amountPaid: 0,
      payments: [],
    });
    const missingInvoiceId = await ctx.db.insert("invoices", {
      orgId,
      roId,
      customerId,
      invoiceNumber: "INV-MISSING",
      status: "sent",
      issuedAt: new Date().toISOString(),
      subtotal: 100,
      taxAmount: 0,
      total: 100,
      amountPaid: 0,
      payments: [],
    });
    await ctx.db.delete(missingInvoiceId);
    return { invoiceId, missingInvoiceId, orgId };
  });
}

function signedCheckoutRequest(
  invoiceId: Id<"invoices">,
  orgId: Id<"organizations">,
  overrides: Record<string, unknown> = {},
) {
  const body = JSON.stringify({
    id: "evt_http_123456789",
    object: "event",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_test_http123456789",
        object: "checkout.session",
        amount_total: 10_000,
        currency: "usd",
        payment_status: "paid",
        client_reference_id: invoiceId,
        metadata: { invoiceId, orgId, expectedAmountCents: "10000" },
        ...overrides,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "checkout.session.completed",
  });
  return {
    body,
    signature: Stripe.webhooks.generateTestHeaderString({ payload: body, secret: WEBHOOK_SECRET }),
  };
}

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
  test("retries recoverable failures and acknowledges terminal rejections", () => {
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "invoice_not_found" })).toEqual({
      accepted: false,
      reason: "invoice_not_found",
    });
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "future_event" })).toEqual({
      accepted: false,
      reason: "future_event",
    });
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "unexpected_failure" })).toEqual({
      accepted: false,
      reason: "unexpected_failure",
    });
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "stale_event" })).toEqual({
      accepted: true,
      reason: "stale_event",
    });
    expect(stripeWebhookMutationAcceptance({
      status: "rejected",
      reason: "invalid_invoice_metadata",
    })).toEqual({
      accepted: true,
      reason: "invalid_invoice_metadata",
    });
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "shop_route_mismatch" })).toEqual({
      accepted: true,
      reason: "shop_route_mismatch",
    });
    expect(stripeWebhookMutationAcceptance({ status: "rejected", reason: "invoice_not_payable" })).toEqual({
      accepted: true,
      reason: "invoice_not_payable",
    });
    expect(stripeWebhookMutationAcceptance({ status: "duplicate" })).toEqual({
      accepted: true,
      reason: "duplicate",
    });
  });

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

describe("Stripe webhook HTTP integration", () => {
  test("persists one payment and acknowledges an event replay", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { invoiceId, orgId } = await setupPayableInvoice(t);
    const request = signedCheckoutRequest(invoiceId, orgId);

    const firstResponse = await t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": request.signature },
      body: request.body,
    });
    const replayResponse = await t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": request.signature },
      body: request.body,
    });

    expect(firstResponse.status).toBe(200);
    expect(await firstResponse.json()).toEqual({ received: true });
    expect(replayResponse.status).toBe(200);
    expect(await replayResponse.json()).toEqual({ received: true });
    await t.run(async (ctx) => {
      const invoice = await ctx.db.get(invoiceId);
      const events = await ctx.db.query("stripeWebhookEvents").collect();
      expect(invoice?.status).toBe("paid");
      expect(invoice?.amountPaid).toBe(100);
      expect(invoice?.payments).toHaveLength(1);
      expect(invoice?.payments[0].reference).toBe("cs_test_http123456789");
      expect(events).toHaveLength(1);
    });
  });

  test("returns 400 without persistence for a retryable missing invoice", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { invoiceId, missingInvoiceId, orgId } = await setupPayableInvoice(t);
    const request = signedCheckoutRequest(invoiceId, orgId, { metadata: {
      invoiceId: missingInvoiceId,
      orgId,
      expectedAmountCents: "10000",
    }, client_reference_id: missingInvoiceId });

    const response = await t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": request.signature },
      body: request.body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ received: false });
    await t.run(async (ctx) => {
      const invoice = await ctx.db.get(invoiceId);
      expect(invoice?.amountPaid).toBe(0);
      expect(invoice?.payments).toEqual([]);
      expect(await ctx.db.query("stripeWebhookEvents").collect()).toEqual([]);
    });
  });

  test("acknowledges a terminal shop mismatch with a durable reconciliation record", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { invoiceId, orgId } = await setupPayableInvoice(t);
    const request = signedCheckoutRequest(invoiceId, orgId, {
      metadata: { invoiceId, orgId: "another_shop", expectedAmountCents: "10000" },
    });

    const response = await t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": request.signature },
      body: request.body,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    await t.run(async (ctx) => {
      expect((await ctx.db.get(invoiceId))?.amountPaid).toBe(0);
      expect(await ctx.db.query("stripeWebhookEvents").collect()).toEqual([]);
      const rejections = await ctx.db.query("stripeWebhookRejections").collect();
      expect(rejections).toHaveLength(1);
      expect(rejections[0]).toMatchObject({
        eventId: "evt_http_123456789",
        sessionId: "cs_test_http123456789",
        invoiceId,
        orgId: "another_shop",
        amountCents: 10_000,
        reason: "shop_route_mismatch",
      });
    });
  });

  test("fails the request and rolls back invoice, ledger, and tech pay writes after patching", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    vi.spyOn(invoiceTechPay, "reconcileTechPayRecord")
      .mockRejectedValueOnce(new Error("injected reconciliation failure"));
    const t = convexTest(schema, modules);
    const { invoiceId, orgId } = await setupPayableInvoice(t);
    const request = signedCheckoutRequest(invoiceId, orgId, {
      id: "cs_test_rollback123456789",
    });

    await expect(t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": request.signature },
      body: request.body,
    })).rejects.toThrow("injected reconciliation failure");
    await t.run(async (ctx) => {
      const invoice = await ctx.db.get(invoiceId);
      expect(invoice?.status).toBe("sent");
      expect(invoice?.amountPaid).toBe(0);
      expect(invoice?.payments).toEqual([]);
      expect(await ctx.db.query("stripeWebhookEvents").collect()).toEqual([]);
      expect(await ctx.db.query("techPayRecords").collect()).toEqual([]);
    });
  });

  test("returns 400 for an invalid signature without changing payment state", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
    const t = convexTest(schema, modules);
    const { invoiceId, orgId } = await setupPayableInvoice(t);
    const request = signedCheckoutRequest(invoiceId, orgId);

    const response = await t.fetch("/stripe-webhook", {
      method: "POST",
      headers: { "stripe-signature": "invalid" },
      body: request.body,
    });

    expect(response.status).toBe(400);
    await t.run(async (ctx) => {
      expect((await ctx.db.get(invoiceId))?.amountPaid).toBe(0);
      expect(await ctx.db.query("stripeWebhookEvents").collect()).toEqual([]);
    });
  });
});