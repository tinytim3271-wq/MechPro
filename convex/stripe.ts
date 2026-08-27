"use node";

import Stripe from "stripe";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";
import { stripeWebhookMutationAcceptance } from "./stripeWebhookValidation";

const DEFAULT_FRONTEND_URL = "https://yourcarguy806.com";
const STRIPE_MIN_USD_CENTS = 50;
const STRIPE_MAX_USD_CENTS = 99_999_999;

function toCents(amount: number, field: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ConvexError({ message: `Invalid ${field}`, code: "BAD_REQUEST" });
  }
  return Math.round(amount * 100);
}

export function validateRedirectUrl(candidate: string | undefined, fallback: string, frontendUrl: string): string {
  const trustedOrigin = new URL(frontendUrl).origin;
  const redirectUrl = new URL(candidate ?? fallback, trustedOrigin);

  if (
    redirectUrl.origin !== trustedOrigin ||
    !["http:", "https:"].includes(redirectUrl.protocol) ||
    redirectUrl.username ||
    redirectUrl.password
  ) {
    throw new ConvexError({ message: "Invalid checkout redirect origin", code: "BAD_REQUEST" });
  }

  return redirectUrl.toString();
}

export function getCheckoutAmountCents(invoice: {
  status: "draft" | "sent" | "partial" | "paid" | "void";
  subtotal: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  ro: {
    laborLines: Array<{ laborHours: number; laborRate: number }>;
    partLines: Array<{ quantity: number; unitPrice: number }>;
    shopFees: Array<{ amount: number }>;
  } | null;
}): number {
  if (invoice.status !== "sent" && invoice.status !== "partial") {
    throw new ConvexError({ message: "Invoice is not open for payment", code: "BAD_REQUEST" });
  }
  if (!invoice.ro) {
    throw new ConvexError({ message: "Invoice repair order not found", code: "BAD_REQUEST" });
  }

  const lineSubtotalCents =
    invoice.ro.laborLines.reduce(
      (sum, line) => sum + toCents(line.laborHours * line.laborRate, "labor amount"),
      0,
    ) +
    invoice.ro.partLines.reduce(
      (sum, line) => sum + toCents(line.quantity * line.unitPrice, "part amount"),
      0,
    ) +
    invoice.ro.shopFees.reduce((sum, fee) => sum + toCents(fee.amount, "shop fee"), 0);
  const subtotalCents = toCents(invoice.subtotal, "invoice subtotal");
  const taxCents = toCents(invoice.taxAmount, "invoice tax");
  const storedTotalCents = toCents(invoice.total, "invoice total");
  const authoritativeTotalCents = lineSubtotalCents + taxCents;

  if (subtotalCents !== lineSubtotalCents || storedTotalCents !== authoritativeTotalCents) {
    throw new ConvexError({ message: "Invoice total does not match its line items", code: "BAD_REQUEST" });
  }

  const balanceCents = authoritativeTotalCents - toCents(invoice.amountPaid, "amount paid");
  if (balanceCents < STRIPE_MIN_USD_CENTS || balanceCents > STRIPE_MAX_USD_CENTS) {
    throw new ConvexError({ message: "Invoice balance is outside the supported payment range", code: "BAD_REQUEST" });
  }

  return balanceCents;
}

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new ConvexError({
      message: "Stripe is not configured. Add your STRIPE_SECRET_KEY in the Secrets tab.",
      code: "BAD_REQUEST",
    });
  }
  return new Stripe(key, { apiVersion: "2026-06-24.dahlia" });
}

async function assertStaffInvoiceAccess(
  ctx: ActionCtx,
  invoiceId: Id<"invoices">,
): Promise<boolean> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return false;

  const user = await ctx.runQuery(internal.commerceHelpers.getUser, {
    tokenIdentifier: identity.tokenIdentifier,
  });
  if (!user?.currentOrgId) return false;

  const invoice = await ctx.runQuery(internal.invoices.getInvoiceInternal, { invoiceId });
  if (!invoice || invoice.orgId !== user.currentOrgId) return false;

  const member = await ctx.runQuery(internal.commerceHelpers.getOrgMembership, {
    orgId: user.currentOrgId,
    userId: user._id,
  });

  return !!member?.isActive;
}

// ─── Create a Stripe Checkout session for an invoice ─────────────────────────

export const createInvoicePaymentLink = action({
  args: {
    invoiceId: v.id("invoices"),
    phoneLast4: v.optional(v.string()),
    successUrl: v.optional(v.string()),
    cancelUrl: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ url: string }> => {
    const staffAuthorized = await assertStaffInvoiceAccess(ctx, args.invoiceId);

    if (!staffAuthorized) {
      if (!args.phoneLast4) {
        throw new ConvexError({ message: "Invoice verification failed", code: "FORBIDDEN" });
      }
      const verified = await ctx.runQuery(internal.invoices.verifyInvoicePhoneAccess, {
        invoiceId: args.invoiceId,
        phoneLast4: args.phoneLast4,
      });
      if (!verified) {
        throw new ConvexError({ message: "Invoice verification failed", code: "FORBIDDEN" });
      }
    }

    const invoice = await ctx.runQuery(internal.invoices.getInvoiceInternal, { invoiceId: args.invoiceId });
    if (!invoice) throw new ConvexError({ message: "Invoice not found", code: "NOT_FOUND" });

    const amountCents = getCheckoutAmountCents(invoice);
    const baseUrl = process.env.FRONTEND_URL ?? DEFAULT_FRONTEND_URL;
    const successUrl = validateRedirectUrl(
      args.successUrl,
      `/pay?invoice=${args.invoiceId}&success=1`,
      baseUrl,
    );
    const cancelUrl = validateRedirectUrl(
      args.cancelUrl,
      `/pay?invoice=${args.invoiceId}`,
      baseUrl,
    );
    const stripe = getStripe();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${invoice.invoiceNumber}`,
              description: invoice.ro
                ? `${invoice.ro.roNumber} — ${invoice.customer?.name ?? "Customer"}`
                : `Invoice ${invoice.invoiceNumber}`,
            },
          },
          quantity: 1,
        },
      ],
      customer_email: invoice.customer?.email ?? undefined,
      metadata: {
        invoiceId: args.invoiceId,
        orgId: invoice.orgId,
        expectedAmountCents: String(amountCents),
      },
      client_reference_id: args.invoiceId,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    if (!session.url) throw new ConvexError({ message: "Failed to create payment link", code: "EXTERNAL_SERVICE_ERROR" });

    return { url: session.url };
  },
});

// ─── Node.js internalAction for Stripe webhook processing ─────────────────────

export const processStripeWebhook = internalAction({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<{ accepted: boolean; reason?: string }> => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new ConvexError({ message: "Stripe webhook is not configured", code: "INTERNAL_ERROR" });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(args.body, args.signature, secret);
    } catch (err) {
      console.error("Webhook signature error:", err);
      return { accepted: false, reason: "invalid_signature" };
    }

    if (event.type !== "checkout.session.completed") {
      return { accepted: true, reason: "ignored_event_type" };
    }

    const session = event.data.object as Stripe.Checkout.Session;
    const result = await ctx.runMutation(internal.invoices.recordStripeCheckoutPayment, {
      eventId: event.id,
      eventCreated: event.created,
      eventType: event.type,
      sessionId: session.id,
      clientReferenceId: session.client_reference_id ?? "",
      paymentStatus: session.payment_status,
      currency: session.currency ?? "",
      amountTotalCents: session.amount_total ?? -1,
      invoiceId: session.metadata?.invoiceId ?? "",
      orgId: session.metadata?.orgId ?? "",
      expectedAmountCents: session.metadata?.expectedAmountCents ?? "",
    });

    if (result.status === "rejected") {
      console.error("Rejected Stripe webhook event", {
        eventId: event.id,
        sessionId: session.id,
        reason: result.reason,
      });
      return stripeWebhookMutationAcceptance(result);
    }

    return stripeWebhookMutationAcceptance(result);
  },
});
