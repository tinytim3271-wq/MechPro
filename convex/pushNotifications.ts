"use node";

import webpush from "web-push";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction } from "./_generated/server";

type PushSubscriptionJson = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  expirationTime?: number | null;
};

function configureVapid(): { publicKey: string } {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not configured");
  }
  const subject = process.env.VAPID_SUBJECT ?? process.env.SES_FROM_EMAIL ?? "mailto:noreply@example.com";
  webpush.setVapidDetails(
    subject.startsWith("mailto:") || subject.startsWith("http") ? subject : `mailto:${subject}`,
    publicKey,
    privateKey,
  );
  return { publicKey };
}

export const getVapidPublicKey = action({
  args: {},
  handler: async (): Promise<{ vapidPublicKey: string }> => {
    // Prefer self-hosted VAPID; fall back to Hercules only when unset.
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      return { vapidPublicKey: process.env.VAPID_PUBLIC_KEY };
    }
    if (process.env.HERCULES_API_KEY) {
      const { Hercules } = await import("@usehercules/sdk");
      const hercules = new Hercules({
        apiKey: process.env.HERCULES_API_KEY,
        apiVersion: "2025-12-09",
      });
      const { vapidPublicKey } = await hercules.pushNotifications.enable();
      return { vapidPublicKey };
    }
    throw new Error("Push notifications are not configured");
  },
});

export const subscribe = action({
  args: { subscription: v.string() },
  handler: async (ctx, args): Promise<{ secret: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    const visitorId = identity?.subject ?? crypto.randomUUID();
    const sub = JSON.parse(args.subscription) as PushSubscriptionJson;

    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      const secret = crypto.randomUUID();
      await ctx.runMutation(internal.pushIdentities.storeIdentity, {
        secret,
        visitorId,
        subscription: sub,
      });
      return { secret };
    }

    if (!process.env.HERCULES_API_KEY) {
      throw new Error("Push notifications are not configured");
    }

    const { Hercules } = await import("@usehercules/sdk");
    const hercules = new Hercules({
      apiKey: process.env.HERCULES_API_KEY,
      apiVersion: "2025-12-09",
    });
    const { secret } = await hercules.pushNotifications.subscribe({
      visitorId,
      subscription: {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
        expirationTime: sub.expirationTime,
      },
    });
    await ctx.runMutation(internal.pushIdentities.storeIdentity, { secret, visitorId });
    return { secret };
  },
});

export const identify = action({
  args: { secret: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Must be authenticated to identify");
    }

    const userId = identity.subject;
    await ctx.runMutation(internal.pushIdentities.updateIdentityVisitorId, {
      secret: args.secret,
      visitorId: userId,
    });

    if (process.env.HERCULES_API_KEY && !process.env.VAPID_PRIVATE_KEY) {
      const { Hercules } = await import("@usehercules/sdk");
      const hercules = new Hercules({
        apiKey: process.env.HERCULES_API_KEY,
        apiVersion: "2025-12-09",
      });
      return hercules.pushNotifications.identify({ secret: args.secret, userId });
    }

    return { success: true };
  },
});

export const unsubscribe = action({
  args: { secret: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    if (process.env.HERCULES_API_KEY && !process.env.VAPID_PRIVATE_KEY) {
      const { Hercules } = await import("@usehercules/sdk");
      const hercules = new Hercules({
        apiKey: process.env.HERCULES_API_KEY,
        apiVersion: "2025-12-09",
      });
      await hercules.pushNotifications.unsubscribe({ secret: args.secret });
    }
    await ctx.runMutation(internal.pushIdentities.deleteIdentity, { secret: args.secret });
    return { success: true };
  },
});

export const sendNotification = internalAction({
  args: {
    visitorIds: v.optional(v.array(v.string())),
    title: v.string(),
    body: v.optional(v.string()),
    icon: v.optional(v.string()),
    badge: v.optional(v.string()),
    image: v.optional(v.string()),
    urgency: v.optional(
      v.union(v.literal("very-low"), v.literal("low"), v.literal("normal"), v.literal("high")),
    ),
  },
  handler: async (ctx, args) => {
    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      configureVapid();
      const identities = await ctx.runQuery(internal.pushIdentities.listByVisitorIds, {
        visitorIds: args.visitorIds ?? [],
      });

      const payload = JSON.stringify({
        title: args.title,
        body: args.body,
        icon: args.icon,
        badge: args.badge,
        image: args.image,
      });

      const urgency =
        args.urgency === "very-low"
          ? "very-low"
          : args.urgency === "low"
            ? "low"
            : args.urgency === "high"
              ? "high"
              : "normal";

      let sent = 0;
      for (const identity of identities) {
        const sub = identity.subscription as PushSubscriptionJson | null;
        if (!sub?.endpoint || !sub.keys) continue;
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            },
            payload,
            { urgency },
          );
          sent += 1;
        } catch (err) {
          console.error("web-push send failed", err);
        }
      }
      return { sent };
    }

    if (!process.env.HERCULES_API_KEY) {
      console.error("Push not configured — skipping notification");
      return { sent: 0 };
    }

    const { Hercules } = await import("@usehercules/sdk");
    const hercules = new Hercules({
      apiKey: process.env.HERCULES_API_KEY,
      apiVersion: "2025-12-09",
    });
    return hercules.pushNotifications.send({
      visitorIds: args.visitorIds,
      title: args.title,
      body: args.body,
      icon: args.icon,
      badge: args.badge,
      image: args.image,
      urgency: args.urgency,
    });
  },
});
