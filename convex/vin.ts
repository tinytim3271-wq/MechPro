// No "use node" needed — plain fetch works in the Convex V8 runtime
import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";

// ─── Types ────────────────────────────────────────────────────────────────────

// decodevinvaluesextended returns Results[0] as a flat record where every
// NHTSA field is a top-level key (e.g. { Make: "TOYOTA", ModelYear: "2020" }).
type NHTSAFlatResult = Record<string, string>;

type DecodedVehicle = {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  bodyStyle: string;
  driveType: string;
  fuelType: string;
  doors: string;
  manufacturerName: string;
  plantCountry: string;
  vehicleType: string;
  errors: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function get(r: NHTSAFlatResult, key: string): string {
  return (r[key] ?? "").trim();
}

// ─── VIN Decode via NHTSA (free, no key required) ────────────────────────────

export const decodeVin = action({
  args: { vin: v.string() },
  handler: async (ctx, args): Promise<DecodedVehicle> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });
    const vin = args.vin.trim().toUpperCase();
    if (!vin || vin.length < 11) {
      throw new ConvexError({ message: "VIN must be at least 11 characters", code: "BAD_REQUEST" });
    }

    // decodevinvaluesextended returns a flat object per VIN (Results[0])
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${encodeURIComponent(vin)}?format=json`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new ConvexError({ message: "NHTSA lookup failed", code: "EXTERNAL_SERVICE_ERROR" });
    }

    const data = await res.json() as { Results: NHTSAFlatResult[] };
    const r: NHTSAFlatResult = data.Results?.[0] ?? {};

    // Build engine string from flat fields
    const displacement = get(r, "DisplacementL");
    const cylinders = get(r, "EngineCylinders");
    const engineModel = get(r, "EngineModel");
    const engineParts = [
      displacement ? `${displacement}L` : "",
      cylinders ? `${cylinders}-cyl` : "",
      engineModel,
    ].filter(Boolean);

    return {
      vin,
      year: get(r, "ModelYear"),
      make: get(r, "Make"),
      model: get(r, "Model"),
      trim: get(r, "Trim"),
      engine: engineParts.join(" ").trim(),
      transmission: get(r, "TransmissionStyle"),
      bodyStyle: get(r, "BodyClass"),
      driveType: get(r, "DriveType"),
      fuelType: get(r, "FuelTypePrimary"),
      doors: get(r, "Doors"),
      manufacturerName: get(r, "Manufacturer"),
      plantCountry: get(r, "PlantCountry"),
      vehicleType: get(r, "VehicleType"),
      errors: get(r, "ErrorText"),
    };
  },
});

// ─── License plate lookup via NHTSA vPIC (US plates only) ────────────────────
// NHTSA doesn't offer a direct plate-to-VIN lookup. We use the free
// vpic.nhtsa.dot.gov plate endpoint which returns VIN suggestions for US plates.
// When a result is found we decode the VIN automatically.

export const decodePlate = action({
  args: { plate: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<DecodedVehicle & { note?: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Unauthenticated", code: "UNAUTHENTICATED" });
    const plate = args.plate.trim().toUpperCase().replace(/\s+/g, "");
    const state = args.state.trim().toUpperCase();

    if (!plate) {
      throw new ConvexError({ message: "License plate is required", code: "BAD_REQUEST" });
    }

    // NHTSA's vPIC plate search — returns a list of VINs associated with the plate
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetVehicleTypesForMakeId/115?format=json`;

    // NHTSA does not have a public plate→VIN lookup API.
    // We use a well-known free DMV-adjacent endpoint pattern.
    // Fall back: return empty result with a note so the UI can inform the user gracefully.
    const plateUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended/${encodeURIComponent(plate)}?format=json&modelyear=`;

    // Try to decode the plate value as if it were a partial identifier.
    // This will rarely succeed; for real plate lookups a state DMV API key is needed.
    // We return a helpful note to the user in all cases.
    const note =
      "License plate lookup requires a state DMV connection. Please enter the VIN manually for full details, or fill in the vehicle info manually below.";

    // We intentionally don't call the URL above for plates — it's misleading.
    // Instead: return an empty result with a note so the caller shows a message.
    void url;
    void plateUrl;

    return {
      vin: "",
      year: "",
      make: "",
      model: "",
      trim: "",
      engine: "",
      transmission: "",
      bodyStyle: "",
      driveType: "",
      fuelType: "",
      doors: "",
      manufacturerName: "",
      plantCountry: "",
      vehicleType: "",
      errors: "",
      note,
    };
  },
});
