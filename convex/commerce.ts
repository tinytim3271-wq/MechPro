"use node";

import { v, ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { Hercules } from "@usehercules/sdk";
import type { Doc } from "./_generated/dataModel.d.ts";

const hercules = new Hercules({
  apiKey: process.env.HERCULES_API_KEY,
  apiVersion: "2025-12-09",
});

const FEATURE_ID = "feat_mechpro_access";

async function ownerHasAccess(owner: Doc<"users">): Promise<boolean> {
  if (owner.freeAccessUntil) {
    const expiresAt = new Date(owner.freeAccessUntil).getTime();
    if (expiresAt > Date.now()) {
      return true;
    }
  }

  if (owner.commerceCustomerId) {
    const result = await hercules.commerce.check({
      customer_id: owner.commerceCustomerId,
      resource_id: FEATURE_ID,
    });
    if (result.has_access) {
      return true;
    }
  }

  return false;
}

// ─── Check if user has purchased MechPro ──────────────────────────────────────

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

    // Check admin-granted free access first
    if (user.freeAccessUntil) {
      const expiresAt = new Date(user.freeAccessUntil).getTime();
      if (expiresAt > Date.now()) {
        return { hasAccess: true, accessType: "free_grant" };
      }
    }

    // Check Hercules Commerce subscription
    if (user.commerceCustomerId) {
      const result = await hercules.commerce.check({
        customer_id: user.commerceCustomerId,
        resource_id: FEATURE_ID,
      });
      if (result.has_access) {
        return { hasAccess: true, accessType: "subscription" };
      }
    }

    // No personal subscription — check if user is a member of an org whose owner has access
    const owner = await ctx.runQuery(internal.commerceHelpers.getOrgOwnerForMember, {
      tokenIdentifier: identity.tokenIdentifier,
    });
    if (owner && (await ownerHasAccess(owner))) {
      return { hasAccess: true, accessType: "org_member" };
    }

    return { hasAccess: false, accessType: "none" };
  },
});

// ─── Create checkout session ───────────────────────────────────────────────────

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

    // Ensure customer exists in Hercules Commerce
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

// ─── Open billing portal ───────────────────────────────────────────────────────

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

    const portal = await hercules.commerce.customers.billingPortal(
      user.commerceCustomerId,
      { return_url: args.returnUrl },
    );

    return { url: portal.url ?? null };
  },
});
