import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

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
        preferredTime: "09:00",
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
});