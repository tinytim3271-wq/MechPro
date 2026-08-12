import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";

// ─── Types ────────────────────────────────────────────────────────────────────
// NHTSA has a free public API (no key required, works with plain fetch in the
// Convex V8 runtime — no "use node" needed).

export type NHTSARecall = {
  NHTSACampaignNumber: string;
  ReportReceivedDate: string;
  Component: string;
  Summary: string;
  Consequence: string;
  Remedy: string;
  Notes: string;
};

export type NHTSAComplaint = {
  odiNumber: number;
  manufacturer: string;
  crash: boolean;
  fire: boolean;
  numberOfInjuries: number;
  numberOfDeaths: number;
  dateOfIncident: string;
  dateComplaintFiled: string;
  vin: string;
  components: string;
  summary: string;
};

export type NHTSASafetyRating = {
  VehicleDescription: string;
  OverallRating: string;
  OverallFrontCrashRating: string;
  OverallSideCrashRating: string;
  RolloverRating: string;
  NHTSAElectronicStabilityControl: string;
  NHTSAForwardCollisionWarning: string;
  NHTSALaneDepartureWarning: string;
  ComplaintsCount: number;
  RecallsCount: number;
};

// ─── Recalls by make / model / year ─────────────────────────────────────────────

export const getRecalls = action({
  args: { make: v.string(), model: v.string(), year: v.number() },
  handler: async (ctx, args): Promise<NHTSARecall[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });
    const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(args.make)}&model=${encodeURIComponent(args.model)}&modelYear=${args.year}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: NHTSARecall[] };
    return data.results ?? [];
  },
});

// ─── Safety complaints by make / model / year ───────────────────────────────────

export const getComplaints = action({
  args: { make: v.string(), model: v.string(), year: v.number() },
  handler: async (ctx, args): Promise<NHTSAComplaint[]> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });
    const url = `https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${encodeURIComponent(args.make)}&model=${encodeURIComponent(args.model)}&modelYear=${args.year}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: NHTSAComplaint[] };
    return data.results ?? [];
  },
});

// ─── Safety ratings by make / model / year ───────────────────────────────────────
// Two-step lookup: first fetch the list of body-style variants (each has an ID),
// then fetch the actual ratings for the first variant.

export const getSafetyRatings = action({
  args: { make: v.string(), model: v.string(), year: v.number() },
  handler: async (ctx, args): Promise<NHTSASafetyRating | null> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });
    // Step 1: get list of vehicle variants with IDs
    const listUrl = `https://api.nhtsa.gov/SafetyRatings/modelyear/${args.year}/make/${encodeURIComponent(args.make)}/model/${encodeURIComponent(args.model)}`;
    const listRes = await fetch(listUrl);
    if (!listRes.ok) return null;
    const listData = (await listRes.json()) as {
      Results?: Array<{ VehicleId: number; VehicleDescription: string }>;
    };
    const variants = listData.Results ?? [];
    if (variants.length === 0) return null;

    // Step 2: get ratings for first variant
    const id = variants[0].VehicleId;
    const ratingUrl = `https://api.nhtsa.gov/SafetyRatings/VehicleId/${id}`;
    const ratingRes = await fetch(ratingUrl);
    if (!ratingRes.ok) return null;
    const ratingData = (await ratingRes.json()) as { Results?: NHTSASafetyRating[] };
    return ratingData.Results?.[0] ?? null;
  },
});
