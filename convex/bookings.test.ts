import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import {
  canonicalizeBookingDate,
  canonicalizeBookingPhone,
  canonicalizeBookingTime,
} from "./bookings";

describe("booking canonicalization", () => {
  test("normalizes equivalent phone and appointment formats", () => {
    expect(canonicalizeBookingPhone("+1 (806) 555-0100")).toBe("8065550100");
    expect(canonicalizeBookingDate("2026-9-1")).toBe("2026-09-01");
    expect(canonicalizeBookingTime("9:00:00")).toBe("09:00");
  });

  test("rejects invalid calendar and clock values", () => {
    expect(() => canonicalizeBookingDate("2026-02-30")).toThrow("valid appointment date");
    expect(() => canonicalizeBookingTime("25:00")).toThrow("valid appointment time");
  });
});

describe("booking capacity", () => {
  test("prevents confirming more bookings than available bays for a time slot", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|booking-owner";

    const { firstBookingId, secondBookingId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        tokenIdentifier,
        name: "Owner",
      });
      const orgId = await ctx.db.insert("organizations", {
        name: "One Bay Shop",
        ownerId: userId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      await ctx.db.patch(userId, { currentOrgId: orgId });
      await ctx.db.insert("orgMembers", {
        orgId,
        userId,
        role: "owner",
        isActive: true,
      });

      const baseBooking = {
        orgId,
        customerPhone: "8065550100",
        serviceDescription: "Inspection",
        preferredDate: "2026-09-01",
        preferredTime: "9:00:00",
        status: "pending" as const,
        submittedAt: "2026-08-26T12:00:00.000Z",
      };
      const firstBookingId = await ctx.db.insert("bookingRequests", {
        ...baseBooking,
        customerName: "First Customer",
      });
      const secondBookingId = await ctx.db.insert("bookingRequests", {
        ...baseBooking,
        customerName: "Second Customer",
        preferredTime: "09:00",
      });
      return { firstBookingId, secondBookingId };
    });

    const authed = t.withIdentity({ tokenIdentifier });
    await authed.mutation(api.bookings.updateBookingStatus, {
      bookingId: firstBookingId,
      status: "confirmed",
    });

    await expect(
      authed.mutation(api.bookings.updateBookingStatus, {
        bookingId: secondBookingId,
        status: "confirmed",
      }),
    ).rejects.toThrow("already at capacity");
  });

  test("ignores malformed legacy slots when confirming a valid booking", async () => {
    const modules = import.meta.glob("./**/*.*s");
    const t = convexTest(schema, modules);
    const tokenIdentifier = "https://testissuer|legacy-booking-owner";

    const bookingId = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", { tokenIdentifier, name: "Owner" });
      const orgId = await ctx.db.insert("organizations", {
        name: "Legacy Shop",
        ownerId: userId,
        taxRate: 8.25,
        laborRate: 120,
        bayCount: 1,
        bayNames: ["Bay 1"],
        isActive: true,
      });
      await ctx.db.patch(userId, { currentOrgId: orgId });
      await ctx.db.insert("orgMembers", { orgId, userId, role: "owner", isActive: true });
      await ctx.db.insert("bookingRequests", {
        orgId,
        customerName: "Legacy Customer",
        customerPhone: "8065550100",
        serviceDescription: "Legacy request",
        preferredDate: "tomorrow",
        preferredTime: "9am",
        status: "confirmed",
        submittedAt: "2026-08-01T12:00:00.000Z",
      });
      return ctx.db.insert("bookingRequests", {
        orgId,
        customerName: "Current Customer",
        customerPhone: "8065550101",
        serviceDescription: "Current request",
        preferredDate: "2026-09-01",
        preferredTime: "09:00",
        status: "pending",
        submittedAt: "2026-08-27T12:00:00.000Z",
      });
    });

    await expect(t.withIdentity({ tokenIdentifier }).mutation(api.bookings.updateBookingStatus, {
      bookingId,
      status: "confirmed",
    })).resolves.toBeNull();
  });
});