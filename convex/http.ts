// V8 runtime — HTTP actions must run in the default Convex runtime, not Node.js
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// Stripe webhook — register this URL in Stripe Dashboard → Developers → Webhooks
// URL: <Convex Site URL>/stripe-webhook
// Event to listen for: checkout.session.completed
http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature") ?? "";

    // Delegate signature verification + DB update to Node.js internalAction
    const result = await ctx.runAction(internal.stripe.processStripeWebhook, { body, signature: sig });

    return new Response(JSON.stringify({ received: result.accepted }), {
      status: result.accepted ? 200 : 400,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
