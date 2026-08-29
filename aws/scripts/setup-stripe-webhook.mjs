#!/usr/bin/env node
/**
 * Create (or reuse) a Stripe webhook for MechPro and print the signing secret.
 *
 * Usage:
 *   $env:STRIPE_SECRET_KEY="sk_live_..."
 *   $env:STRIPE_WEBHOOK_URL="https://y790h8osxf.execute-api.us-east-1.amazonaws.com/stripe-webhook"
 *   node aws/scripts/setup-stripe-webhook.mjs
 */
import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key || key === "REPLACE_ME") {
  console.error("Set STRIPE_SECRET_KEY to a live or test secret key.");
  process.exit(1);
}

const webhookUrl =
  process.env.STRIPE_WEBHOOK_URL ??
  "https://y790h8osxf.execute-api.us-east-1.amazonaws.com/stripe-webhook";

const events = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];

const stripe = new Stripe(key, { apiVersion: "2026-06-24.dahlia" });

const existing = await stripe.webhookEndpoints.list({ limit: 100 });
let endpoint = existing.data.find((e) => e.url === webhookUrl);

if (!endpoint) {
  endpoint = await stripe.webhookEndpoints.create({
    url: webhookUrl,
    enabled_events: events,
    description: "MechPro AWS API",
  });
  console.log("Created webhook endpoint:", endpoint.id);
} else {
  endpoint = await stripe.webhookEndpoints.update(endpoint.id, {
    enabled_events: events,
    disabled: false,
  });
  console.log("Updated webhook endpoint:", endpoint.id);
}

console.log("\nAdd this to Secrets Manager (STRIPE_WEBHOOK_SECRET):");
console.log(endpoint.secret);
