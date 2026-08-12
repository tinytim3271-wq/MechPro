"use node";

import { action } from "./_generated/server";
import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel.d.ts";

/**
 * Reports a completed repair order to the Carfax Service Network.
 *
 * The Carfax Service History API is partner-only. Shops must be enrolled in
 * the Carfax Service Network and obtain a Partner Key + Location ID from Carfax.
 *
 * This action builds the payload in the standard Carfax Service Record format
 * and POSTs it to the Carfax API endpoint.
 */
export const reportToCarfax = action({
  args: { roId: v.id("repairOrders") },
  handler: async (ctx, args): Promise<{ success: boolean; error?: string }> => {
    // Fetch the RO with enriched data
    const ro = await ctx.runQuery(api.repairOrders.getRO, { roId: args.roId });
    if (!ro) {
      return { success: false, error: "Repair order not found" };
    }

    if (ro.status !== "completed" && ro.status !== "invoiced") {
      return { success: false, error: "Only completed or invoiced ROs can be reported to Carfax" };
    }

    if (!ro.org) {
      return { success: false, error: "Organization not found" };
    }

    const org = ro.org as Doc<"organizations">;

    if (!org.carfaxEnabled) {
      return { success: false, error: "Carfax reporting is not enabled. Enable it in Settings." };
    }

    if (!org.carfaxPartnerKey || !org.carfaxLocationId) {
      return { success: false, error: "Carfax credentials not configured. Add your Partner Key and Location ID in Settings." };
    }

    const vehicle = ro.vehicle;
    if (!vehicle) {
      return { success: false, error: "Vehicle data missing on this RO" };
    }

    if (!vehicle.vin) {
      return { success: false, error: "Vehicle VIN is required for Carfax reporting. Please add a VIN to this vehicle." };
    }

    // Build service line items
    const serviceLines: Array<{
      serviceType: string;
      description: string;
      laborHours?: number;
    }> = [];

    for (const labor of ro.laborLines) {
      serviceLines.push({
        serviceType: "LABOR",
        description: labor.description,
        laborHours: labor.laborHours,
      });
    }

    for (const part of ro.partLines) {
      serviceLines.push({
        serviceType: "PARTS",
        description: `${part.description}${part.partNumber ? ` (${part.partNumber})` : ""}`,
      });
    }

    for (const fee of ro.shopFees) {
      serviceLines.push({
        serviceType: "OTHER",
        description: fee.description,
      });
    }

    // Build the Carfax Service Record payload
    const payload = {
      partnerKey: org.carfaxPartnerKey,
      locationId: org.carfaxLocationId,
      serviceRecord: {
        vin: vehicle.vin,
        mileageIn: ro.mileageIn,
        mileageOut: ro.mileageOut,
        serviceDate: ro.completedAt ?? new Date().toISOString(),
        roNumber: ro.roNumber,
        customerComplaint: ro.complaint,
        technicianDiagnosis: ro.cause,
        workPerformed: ro.correction,
        serviceLines,
      },
    };

    try {
      // POST to Carfax Service History API
      // Endpoint: https://servicehistory.carfax.com/api/v1/service-records
      // This is the partner API endpoint (requires enrollment in Carfax Service Network)
      const response = await fetch("https://servicehistory.carfax.com/api/v1/service-records", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Partner-Key": org.carfaxPartnerKey,
          "X-Location-Id": org.carfaxLocationId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        // Common error: not enrolled yet
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            error: "Carfax authentication failed. Verify your Partner Key and Location ID are correct and that your shop is enrolled in the Carfax Service Network.",
          };
        }
        return {
          success: false,
          error: `Carfax API error (${response.status}): ${body.slice(0, 200)}`,
        };
      }

      // Mark the RO as reported
      await ctx.runMutation(internal.carfaxInternal.markReported, { roId: args.roId });

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      // Network errors likely mean the shop isn't enrolled yet
      if (message.includes("ENOTFOUND") || message.includes("getaddrinfo")) {
        return {
          success: false,
          error: "Unable to reach Carfax API. Make sure your shop is enrolled in the Carfax Service Network and your credentials are correct.",
        };
      }
      return { success: false, error: `Failed to report to Carfax: ${message}` };
    }
  },
});
