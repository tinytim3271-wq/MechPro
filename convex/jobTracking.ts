import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { MutationCtx } from "./_generated/server";
import { assertOrgResource, getActiveMembership, requireActiveMembership } from "./authorization";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Haversine distance between two lat/lng in meters */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => d * (Math.PI / 180);
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Basic geocoding from service address string to approximate lat/lng.
 *  Returns null if we can't parse. For full accuracy this would use a geocoding API
 *  but for MVP we store the geocoded coords alongside the RO.
 */

const GEOFENCE_RADIUS_METERS = 200;

async function getAuthedMember(ctx: MutationCtx) {
  return requireActiveMembership(ctx);
}

// ─── Send job GPS ping from tech ──────────────────────────────────────────────
// Called every ~60s by the tech's phone while job tracking is active

export const sendJobPing = mutation({
  args: {
    roId: v.id("repairOrders"),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ status: string; distanceMeters: number | null }> => {
    const { member, orgId } = await getAuthedMember(ctx);

    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    // Record the ping in locationPings table
    await ctx.db.insert("locationPings", {
      orgId,
      memberId: member._id,
      lat: args.lat,
      lng: args.lng,
      accuracy: args.accuracy,
      timestamp: new Date().toISOString(),
      roId: args.roId,
    });

    // Check if we have a job site lat/lng stored on the RO
    if (ro.serviceLat == null || ro.serviceLng == null) {
      // No geocoded destination — just record the ping, mark en_route
      if (!ro.techLocationStatus || ro.techLocationStatus === "left_site") {
        await ctx.db.patch(args.roId, {
          techLocationStatus: "en_route" as const,
          techLocationUpdatedAt: new Date().toISOString(),
        });
      }
      return { status: ro.techLocationStatus ?? "en_route", distanceMeters: null };
    }

    // Calculate distance from tech to job site
    const distance = haversineMeters(args.lat, args.lng, ro.serviceLat!, ro.serviceLng!);
    const isWithinGeofence = distance <= GEOFENCE_RADIUS_METERS;
    const previousStatus = ro.techLocationStatus;
    let newStatus: "en_route" | "on_site" | "left_site" = previousStatus ?? "en_route";

    if (isWithinGeofence && previousStatus !== "on_site") {
      // Tech just arrived
      newStatus = "on_site";
      await ctx.db.patch(args.roId, {
        techLocationStatus: "on_site" as const,
        techLocationUpdatedAt: new Date().toISOString(),
      });

      // Create notification for office
      const techUser = await ctx.db.get(member.userId);
      await ctx.db.insert("officeNotifications", {
        orgId,
        roId: args.roId,
        type: "tech_arrived",
        title: "Tech Arrived",
        body: `${techUser?.name ?? "Tech"} arrived at ${ro.roNumber} job site`,
        techMemberId: member._id,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } else if (!isWithinGeofence && previousStatus === "on_site") {
      // Tech just left
      newStatus = "left_site";
      await ctx.db.patch(args.roId, {
        techLocationStatus: "left_site" as const,
        techLocationUpdatedAt: new Date().toISOString(),
      });

      // Create notification for office
      const techUser = await ctx.db.get(member.userId);
      await ctx.db.insert("officeNotifications", {
        orgId,
        roId: args.roId,
        type: "tech_left",
        title: "Tech Left Site",
        body: `${techUser?.name ?? "Tech"} left the ${ro.roNumber} job site`,
        techMemberId: member._id,
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    } else if (!isWithinGeofence && previousStatus !== "on_site" && previousStatus !== "left_site") {
      // Still en route
      if (previousStatus !== "en_route") {
        await ctx.db.patch(args.roId, {
          techLocationStatus: "en_route" as const,
          techLocationUpdatedAt: new Date().toISOString(),
        });
      }
      newStatus = "en_route";
    }

    return { status: newStatus, distanceMeters: Math.round(distance) };
  },
});

// ─── Start job tracking (sets status to en_route) ─────────────────────────────

export const startTracking = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const { member, orgId } = await getAuthedMember(ctx);

    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    await ctx.db.patch(args.roId, {
      techLocationStatus: "en_route" as const,
      techLocationUpdatedAt: new Date().toISOString(),
    });

    // Notify office
    const techUser = await ctx.db.get(member.userId);
    await ctx.db.insert("officeNotifications", {
      orgId,
      roId: args.roId,
      type: "tech_en_route",
      title: "Tech En Route",
      body: `${techUser?.name ?? "Tech"} is heading to ${ro.roNumber} job site`,
      techMemberId: member._id,
      isRead: false,
      createdAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// ─── Stop job tracking ────────────────────────────────────────────────────────

export const stopTracking = mutation({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const { orgId } = await getAuthedMember(ctx);

    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    // Only set to left_site if they were on_site; otherwise just clear
    const newStatus = ro.techLocationStatus === "on_site" ? "left_site" as const : undefined;
    await ctx.db.patch(args.roId, {
      techLocationStatus: newStatus,
      techLocationUpdatedAt: new Date().toISOString(),
    });

    return { success: true };
  },
});

// ─── Set job site coordinates ─────────────────────────────────────────────────
// Called when a service address is geocoded (from frontend using browser Geocoding API)

export const setJobSiteCoords = mutation({
  args: {
    roId: v.id("repairOrders"),
    lat: v.number(),
    lng: v.number(),
  },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const { orgId } = await getAuthedMember(ctx);

    const ro = await ctx.db.get(args.roId);
    assertOrgResource(ro, orgId, "Repair order");

    // Store geocoded coordinates on the RO
    await ctx.db.patch(args.roId, {
      serviceLat: args.lat,
      serviceLng: args.lng,
    });

    return { success: true };
  },
});

// ─── Get tech tracking status for an RO ───────────────────────────────────────

export const getTrackingStatus = query({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args) => {
    // Require auth + org ownership
    const membership = await getActiveMembership(ctx);
    if (!membership) return null;

    const ro = await ctx.db.get(args.roId);
    if (!ro || ro.orgId !== membership.orgId) return null;

    // Get latest ping for this RO (only if tech is assigned)
    let latestPing = null;
    if (ro.assignedTo) {
      latestPing = await ctx.db
        .query("locationPings")
        .withIndex("by_member", (q) => q.eq("memberId", ro.assignedTo!))
        .order("desc")
        .first();
    }

    return {
      techLocationStatus: ro.techLocationStatus ?? null,
      techLocationUpdatedAt: ro.techLocationUpdatedAt ?? null,
      lastPing: latestPing ? {
        lat: latestPing.lat,
        lng: latestPing.lng,
        timestamp: latestPing.timestamp,
      } : null,
    };
  },
});

// ─── Get unread notifications for office ──────────────────────────────────────

export const getUnreadNotifications = query({
  args: {},
  handler: async (ctx) => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return [];

    const notifications = await ctx.db
      .query("officeNotifications")
      .withIndex("by_org_unread", (q) => q.eq("orgId", membership.orgId).eq("isRead", false))
      .order("desc")
      .take(20);

    return notifications;
  },
});

// ─── Mark notification as read ────────────────────────────────────────────────

export const markNotificationRead = mutation({
  args: { notificationId: v.id("officeNotifications") },
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    // Require auth + org ownership of the notification
    const { orgId } = await requireActiveMembership(ctx);

    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.orgId !== orgId) {
      throw new ConvexError({ message: "Notification not found", code: "NOT_FOUND" });
    }

    await ctx.db.patch(args.notificationId, { isRead: true });
    return { success: true };
  },
});

// ─── Mark all notifications as read ──────────────────────────────────────────

export const markAllNotificationsRead = mutation({
  args: {},
  handler: async (ctx): Promise<{ success: boolean }> => {
    const membership = await getActiveMembership(ctx);
    if (!membership) return { success: false };

    const unread = await ctx.db
      .query("officeNotifications")
      .withIndex("by_org_unread", (q) => q.eq("orgId", membership.orgId).eq("isRead", false))
      .take(100);

    for (const n of unread) {
      await ctx.db.patch(n._id, { isRead: true });
    }

    return { success: true };
  },
});
