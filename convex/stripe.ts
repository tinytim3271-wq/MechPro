"use node";

import Stripe from "stripe";
import { v, ConvexError } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server.d.ts";
import type { Id } from "./_generated/dataModel.d.ts";

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
    if (invoice.status === "paid") throw new ConvexError({ message: "Invoice is already paid", code: "BAD_REQUEST" });

    const stripe = getStripe();
    const balance = invoice.total - invoice.amountPaid;
    const baseUrl = process.env.FRONTEND_URL ?? "https://yourcarguy806.com";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: Math.round(balance * 100),
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
      },
      success_url: args.successUrl ?? `${baseUrl}/pay?invoice=${args.invoiceId}&success=1`,
      cancel_url: args.cancelUrl ?? `${baseUrl}/pay?invoice=${args.invoiceId}`,
    });

    if (!session.url) throw new ConvexError({ message: "Failed to create payment link", code: "EXTERNAL_SERVICE_ERROR" });

    return { url: session.url };
  },
});

// ─── Node.js internalAction for Stripe webhook processing ─────────────────────

export const processStripeWebhook = internalAction({
  args: { body: v.string(), signature: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const stripe = getStripe();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      console.error("STRIPE_WEBHOOK_SECRET not set");
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(args.body, args.signature, secret);
    } catch (err) {
      console.error("Webhook signature error:", err);
      return;
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const invoiceId = session.metadata?.invoiceId;
      if (invoiceId && session.payment_status === "paid") {
        const amountPaid = (session.amount_total ?? 0) / 100;
        try {
          await ctx.runMutation(internal.invoices.addPaymentInternal, {
            invoiceId: invoiceId as Id<"invoices">,
            method: "card",
            amount: amountPaid,
            reference: session.id,
          });
        } catch (err) {
          console.error("Failed to record payment:", err);
        }
      }
    }
  },
});
