import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import type { QueryCtx, MutationCtx } from "./_generated/server.d.ts";

// ─── Helper ────────────────────────────────────────────────────────────────────

export function canonicalizeBookingPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const canonical = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (canonical.length < 10 || canonical.length > 15) {
    throw new ConvexError({ message: "A valid phone number is required", code: "BAD_REQUEST" });
  }
  return canonical;
}

export function canonicalizeBookingDate(value: string): string {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim());
  if (!match) {
    throw new ConvexError({ message: "A valid appointment date is required", code: "BAD_REQUEST" });
  }
  const [, year, month, day] = match;
  const canonical = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${canonical}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== canonical) {
    throw new ConvexError({ message: "A valid appointment date is required", code: "BAD_REQUEST" });
  }
  return canonical;
}

export function canonicalizeBookingTime(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(value.trim());
  if (!match) {
    throw new ConvexError({ message: "A valid appointment time is required", code: "BAD_REQUEST" });
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new ConvexError({ message: "A valid appointment time is required", code: "BAD_REQUEST" });
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function getAuthedOrgId(ctx: QueryCtx | MutationCtx): Promise<Id<"organizations">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
    .unique();
  if (!user?.currentOrgId) throw new ConvexError({ message: "No active organization", code: "BAD_REQUEST" });
  return user.currentOrgId;
}

// ─── Public: Submit a booking request (no auth required) ──────────────────────

export const submitBooking = mutation({
  args: {
    orgId: v.id("organizations"),
    customerName: v.string(),
    customerPhone: v.string(),
    customerEmail: v.optional(v.string()),
    vehicleYear: v.optional(v.string()),
    vehicleMake: v.optional(v.string()),
    vehicleModel: v.optional(v.string()),
    vehicleVin: v.optional(v.string()),
    serviceDescription: v.string(),
    preferredDate: v.string(),
    preferredTime: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"bookingRequests">> => {
    // Validate the org exists and is active
    const org = await ctx.db.get(args.orgId);
    if (!org || !org.isActive) {
      throw new ConvexError({ message: "Shop not found", code: "NOT_FOUND" });
    }

    const customerPhone = canonicalizeBookingPhone(args.customerPhone);
    const preferredDate = canonicalizeBookingDate(args.preferredDate);
    const preferredTime = canonicalizeBookingTime(args.preferredTime);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recentRequests = await ctx.db
      .query("bookingRequests")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) =>
        q.and(
          q.eq(q.field("customerPhone"), customerPhone),
          q.gte(q.field("submittedAt"), oneHourAgo),
        ),
      )
      .take(5);

    if (recentRequests.length >= 3) {
      throw new ConvexError({
        message: "Too many booking requests. Please try again later or call the shop directly.",
        code: "RATE_LIMITED",
      });
    }

    return await ctx.db.insert("bookingRequests", {
      ...args,
      customerPhone,
      preferredDate,
      preferredTime,
      status: "pending",
      submittedAt: new Date().toISOString(),
    });
  },
});

// ─── Staff: List booking requests ─────────────────────────────────────────────

export const listBookingRequests = query({
  args: { status: v.optional(v.union(v.literal("pending"), v.literal("confirmed"), v.literal("declined"), v.literal("converted"))) },
  handler: async (ctx, args): Promise<Array<Doc<"bookingRequests">>> => {
    const orgId = await getAuthedOrgId(ctx).catch(() => null);
    if (!orgId) return [];

    if (args.status) {
      return await ctx.db
        .query("bookingRequests")
        .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", args.status!))
        .order("desc")
        .take(100);
    }

    return await ctx.db
      .query("bookingRequests")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .order("desc")
      .take(100);
  },
});

// ─── Staff: Update booking status ─────────────────────────────────────────────

export const updateBookingStatus = mutation({
  args: {
    bookingId: v.id("bookingRequests"),
    status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("declined"), v.literal("converted")),
    staffNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const orgId = await getAuthedOrgId(ctx);
    const booking = await ctx.db.get(args.bookingId);
    if (!booking || booking.orgId.toString() !== orgId.toString()) {
      throw new ConvexError({ message: "Booking not found", code: "NOT_FOUND" });
    }

    if (args.status === "confirmed" && booking.status !== "confirmed") {
      const org = await ctx.db.get(orgId);
      if (!org || !org.isActive) {
        throw new ConvexError({ message: "Shop not found", code: "NOT_FOUND" });
      }

      const bookingDate = canonicalizeBookingDate(booking.preferredDate);
      const bookingTime = canonicalizeBookingTime(booking.preferredTime);
      const confirmed = await ctx.db
        .query("bookingRequests")
        .withIndex("by_org_status", (q) => q.eq("orgId", orgId).eq("status", "confirmed"))
        .collect();

      const slotCount = confirmed.filter((candidate) =>
        canonicalizeBookingDate(candidate.preferredDate) === bookingDate
        && canonicalizeBookingTime(candidate.preferredTime) === bookingTime
      ).length;

      if (slotCount >= org.bayCount) {
        throw new ConvexError({
          message: "This appointment time is already at capacity",
          code: "CONFLICT",
        });
      }
    }

    await ctx.db.patch(args.bookingId, { status: args.status, staffNotes: args.staffNotes });
  },
});

// ─── Public: Get org info for booking page ─────────────────────────────────────

export const getOrgForBooking = query({
  args: { orgId: v.id("organizations") },
  handler: async (ctx, args): Promise<Pick<Doc<"organizations">, "_id" | "name" | "phone" | "email" | "address" | "city" | "state" | "logoUrl"> | null> => {
    const org = await ctx.db.get(args.orgId);
    if (!org || !org.isActive) return null;
    return {
      _id: org._id,
      name: org.name,
      phone: org.phone,
      email: org.email,
      address: org.address,
      city: org.city,
      state: org.state,
      logoUrl: org.logoUrl,
    };
  },
});

// ─── Public: Get the default org (first active) for booking without ID ────────

export const getDefaultOrgForBooking = query({
  args: {},
  handler: async (ctx): Promise<Pick<Doc<"organizations">, "_id" | "name" | "phone" | "email" | "address" | "city" | "state" | "logoUrl"> | null> => {
    const org = await ctx.db
      .query("organizations")
      .filter((q) => q.eq(q.field("isActive"), true))
      .first();
    if (!org) return null;
    return {
      _id: org._id,
      name: org.name,
      phone: org.phone,
      email: org.email,
      address: org.address,
      city: org.city,
      state: org.state,
      logoUrl: org.logoUrl,
    };
  },
});

// Suppress unused import
void ConvexError;
