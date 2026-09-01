"use node";

import Stripe from "stripe";
import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel.d.ts";

/**
 * SaaS entitlement + checkout.
 *
 * On AWS this uses Stripe Billing (customer + subscription Checkout + portal).
 * Legacy Hercules Commerce remains as a fall-through when STRIPE_SECRET_KEY is
 * absent but HERCULES_API_KEY is set.
 */

const FEATURE_ID = "feat_mechpro_access";

const VARIANT_TO_ENV: Record<string, string> = {
  var_monthly_29: "STRIPE_PRICE_MONTHLY",
  var_annual_278: "STRIPE_PRICE_ANNUAL",
};

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-08-26.dahlia" as Stripe.LatestApiVersion });
}

async function stripeCustomerHasAccess(customerId: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  return subs.data.some((s) => s.status === "active" || s.status === "trialing");
}

async function ownerHasAccess(owner: Doc<"users">): Promise<boolean> {
  if (owner.freeAccessUntil) {
    const expiresAt = new Date(owner.freeAccessUntil).getTime();
    if (expiresAt > Date.now()) return true;
  }

  if (owner.commerceCustomerId) {
    if (getStripe()) {
      if (await stripeCustomerHasAccess(owner.commerceCustomerId)) return true;
    } else if (process.env.HERCULES_API_KEY) {
      const { Hercules } = await import("@usehercules/sdk");
      const hercules = new Hercules({
        apiKey: process.env.HERCULES_API_KEY,
        apiVersion: "2025-12-09",
      });
      const result = await hercules.commerce.check({
        customer_id: owner.commerceCustomerId,
        resource_id: FEATURE_ID,
      });
      if (result.has_access) return true;
    }
  }

  return false;
}

export const checkAccess = action({
  args: {},
  handler: async (ctx): Promise<{ hasAccess: boolean; accessType: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.runQuery(internal.commerceHelpers.getUser, {
      tokenIdentifier: identity.tokenIdentifier,
    });

    if (!user) {
      const owner = await ctx.runQuery(internal.commerceHelpers.getOrgOwnerForMember, {
        tokenIdentifier: identity.tokenIdentifier,
      });
      if (owner && (await ownerHasAccess(owner))) {
        return { hasAccess: true, accessType: "org_member" };
      }
      return { hasAccess: false, accessType: "none" };
    }

    if (user.freeAccessUntil) {
      const expiresAt = new Date(user.freeAccessUntil).getTime();
      if (expiresAt > Date.now()) {
        return { hasAccess: true, accessType: "free_grant" };
      }
    }

    if (user.commerceCustomerId) {
      if (getStripe()) {
        if (await stripeCustomerHasAccess(user.commerceCustomerId)) {
          return { hasAccess: true, accessType: "subscription" };
        }
      } else if (process.env.HERCULES_API_KEY) {
        const { Hercules } = await import("@usehercules/sdk");
        const hercules = new Hercules({
          apiKey: process.env.HERCULES_API_KEY,
          apiVersion: "2025-12-09",
        });
        const result = await hercules.commerce.check({
          customer_id: user.commerceCustomerId,
          resource_id: FEATURE_ID,
        });
        if (result.has_access) {
          return { hasAccess: true, accessType: "subscription" };
        }
      }
    }

    const owner = await ctx.runQuery(internal.commerceHelpers.getOrgOwnerForMember, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (owner && (await ownerHasAccess(owner))) {
      return { hasAccess: true, accessType: "org_member" };
    }

    return { hasAccess: false, accessType: "none" };
  },
});

export const createCheckout = action({
  args: {
    variantId: v.string(),
    successUrl: v.string(),
    cancelUrl: v.string(),
  },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.runQuery(internal.commerceHelpers.getUser, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user) {
      throw new ConvexError({ message: "User not found", code: "NOT_FOUND" });
    }

    const stripe = getStripe();
    if (stripe) {
      let customerId = user.commerceCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          name: identity.name ?? "Customer",
          email: identity.email ?? undefined,
          metadata: { userId: user._id, tokenIdentifier: identity.tokenIdentifier },
        });
        customerId = customer.id;
        await ctx.runMutation(internal.commerceHelpers.setCustomerId, {
          userId: user._id,
          commerceCustomerId: customerId,
        });
      }

      const priceEnv = VARIANT_TO_ENV[args.variantId];
      const priceId =
        (priceEnv ? process.env[priceEnv] : undefined) ||
        process.env.STRIPE_PRICE_ID ||
        args.variantId;

      if (!priceId || priceId.startsWith("var_")) {
        throw new ConvexError({
          message:
            "Stripe Price is not configured. Set STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL in secrets.",
          code: "BAD_REQUEST",
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
        subscription_data: { trial_period_days: 7 },
        allow_promotion_codes: true,
      });

      return { url: session.url ?? null };
    }

    if (!process.env.HERCULES_API_KEY) {
      throw new ConvexError({
        message: "Billing is not configured",
        code: "BAD_REQUEST",
      });
    }

    const { Hercules } = await import("@usehercules/sdk");
    const hercules = new Hercules({
      apiKey: process.env.HERCULES_API_KEY,
      apiVersion: "2025-12-09",
    });

    let customerId = user.commerceCustomerId;
    if (!customerId) {
      const customer = await hercules.commerce.customers.create({
        name: identity.name ?? "Customer",
        email: identity.email ?? undefined,
      });
      customerId = customer.id;
      await ctx.runMutation(internal.commerceHelpers.setCustomerId, {
        userId: user._id,
        commerceCustomerId: customerId,
      });
    }

    const session = await hercules.commerce.checkout({
      customer_id: customerId,
      line_items: [{ variant_id: args.variantId, quantity: 1 }],
      success_url: args.successUrl,
      cancel_url: args.cancelUrl,
      trial_period_days: 7,
    });

    return { url: session.url ?? null };
  },
});

export const getBillingPortal = action({
  args: { returnUrl: v.string() },
  handler: async (ctx, args): Promise<{ url: string | null }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
    }

    const user = await ctx.runQuery(internal.commerceHelpers.getUser, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (!user?.commerceCustomerId) {
      throw new ConvexError({ message: "No billing account found", code: "NOT_FOUND" });
    }

    const stripe = getStripe();
    if (stripe) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: user.commerceCustomerId,
        return_url: args.returnUrl,
      });
      return { url: portal.url ?? null };
    }

    if (!process.env.HERCULES_API_KEY) {
      throw new ConvexError({ message: "Billing is not configured", code: "BAD_REQUEST" });
    }

    const { Hercules } = await import("@usehercules/sdk");
    const hercules = new Hercules({
      apiKey: process.env.HERCULES_API_KEY,
      apiVersion: "2025-12-09",
    });
    const portal = await hercules.commerce.customers.billingPortal(user.commerceCustomerId, {
      return_url: args.returnUrl,
    });
    return { url: portal.url ?? null };
  },
});
