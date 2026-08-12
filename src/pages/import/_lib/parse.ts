import Papa from "papaparse";
import type { ImportType } from "./templates.ts";

// ─── Parsed row shapes ────────────────────────────────────────────────────────

export type CustomerRow = {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
  source?: string;
};

export type VehicleRow = {
  customerName: string;
  year: string;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  licensePlate?: string;
  color?: string;
  mileage?: number;
  engine?: string;
  transmission?: string;
  notes?: string;
};

export type PartRow = {
  name: string;
  sku?: string;
  partNumber?: string;
  description?: string;
  category?: string;
  stockQty: number;
  lowStockThreshold: number;
  unitCost: number;
  unitPrice: number;
  supplier?: string;
  location?: string;
};

export type ParsedRow = CustomerRow | VehicleRow | PartRow;

export type RowError = { row: number; message: string };

export type ParseResult<T> = {
  data: T[];
  errors: RowError[];
};

// ─── Normalize CSV header ─────────────────────────────────────────────────────

function norm(h: string) {
  return h
    .trim()
    .toLowerCase()
    .replace(/#/g, "_number")    // ARI uses "Part #" → "part_number"
    .replace(/[\s_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

// ─── Column aliases — support Mitchell1, Tekmetric, Shop-Ware, ARI, generic ──

const CUSTOMER_ALIASES: Record<string, keyof CustomerRow> = {
  // Generic / Mitchell1 / Tekmetric / Shop-Ware
  name: "name", customer_name: "name", full_name: "name",
  phone: "phone", phone_number: "phone", mobile: "phone", cell: "phone",
  email: "email", email_address: "email",
  address: "address", street: "address", street_address: "address",
  city: "city",
  state: "state", province: "state",
  zip: "zip", postal_code: "zip", zipcode: "zip",
  notes: "notes", note: "notes", comments: "notes",
  source: "source", lead_source: "source",
  // ARI-specific
  client_name: "name",
  business_name: "name",          // ARI uses "Business Name" for company clients
  client_business_name: "name",
  phone_1: "phone",               // ARI exports "Phone 1" as primary phone
  phone_2: "phone",               // fallback if phone_1 absent
  primary_phone: "phone",
  client_phone: "phone",
  client_email: "email",
  client_address: "address",
  address_line_1: "address",
  client_city: "city",
  client_state: "state",
  zip_code: "zip",                // ARI uses "Zip Code"
  client_zip: "zip",
  client_notes: "notes",
};

const VEHICLE_ALIASES: Record<string, keyof VehicleRow> = {
  // Generic / Mitchell1 / Tekmetric / Shop-Ware
  customer_name: "customerName", customer: "customerName", owner: "customerName", name: "customerName",
  year: "year", model_year: "year",
  make: "make", manufacturer: "make",
  model: "model",
  trim: "trim", sub_model: "trim",
  vin: "vin", vin_number: "vin",
  license_plate: "licensePlate", plate: "licensePlate", tag: "licensePlate",
  color: "color", exterior_color: "color",
  mileage: "mileage", odometer: "mileage", miles: "mileage", current_mileage: "mileage",
  engine: "engine", engine_type: "engine",
  transmission: "transmission", trans: "transmission",
  notes: "notes", note: "notes",
  // ARI-specific
  client_name: "customerName",    // ARI vehicle exports include "Client Name"
  client: "customerName",
  vehicle_owner: "customerName",
  vehicle_year: "year",
  vehicle_make: "make",           // ARI uses "Vehicle Make"
  vehicle_model: "model",         // ARI uses "Vehicle Model"
  vehicle_trim: "trim",
  vehicle_vin: "vin",
  vehicle_vin_number: "vin",
  license: "licensePlate",
  vehicle_license_plate: "licensePlate",
  vehicle_color: "color",
  current_mileage_in: "mileage",
  vehicle_mileage: "mileage",
  engine_size: "engine",
  vehicle_engine: "engine",
  vehicle_transmission: "transmission",
  vehicle_notes: "notes",
};

const PART_ALIASES: Record<string, keyof PartRow> = {
  // Generic / Mitchell1 / Tekmetric / Shop-Ware
  name: "name", part_name: "name", description_short: "name", item_name: "name",
  sku: "sku", item_sku: "sku",
  part_number: "partNumber", part_no: "partNumber", oem_number: "partNumber",
  description: "description", long_description: "description",
  category: "category", type: "category",
  stock_qty: "stockQty", quantity: "stockQty", qty: "stockQty", on_hand: "stockQty", in_stock: "stockQty",
  low_stock_threshold: "lowStockThreshold", reorder_point: "lowStockThreshold", min_qty: "lowStockThreshold",
  unit_cost: "unitCost", cost: "unitCost", purchase_price: "unitCost",
  unit_price: "unitPrice", price: "unitPrice", sell_price: "unitPrice", retail_price: "unitPrice",
  supplier: "supplier", vendor: "supplier",
  location: "location", bin: "location", shelf: "location",
  // ARI-specific — "Part #" normalizes to "part_number" via norm()
  item_number: "partNumber",
  item_description: "name",       // ARI "Item Description" maps to name
  service_name: "name",           // ARI sometimes exports services alongside parts
  selling_price: "unitPrice",     // ARI uses "Selling Price"
  list_price: "unitPrice",
  ari_price: "unitPrice",
  purchase_cost: "unitCost",      // ARI "Purchase Cost" / "Purchase Price"
  quantity_in_stock: "stockQty",  // ARI uses "Quantity In Stock"
  qty_in_stock: "stockQty",
  stock_quantity: "stockQty",
  reorder_quantity: "lowStockThreshold",
  min_stock: "lowStockThreshold",
  part_category: "category",
  item_category: "category",
  brand: "supplier",              // ARI sometimes exports brand as vendor proxy
  part_brand: "supplier",
  storage_location: "location",
  bin_location: "location",
};

function aliasRow<T>(rawRow: Record<string, unknown>, aliases: Record<string, keyof T>): Partial<T> {
  const result: Partial<T> = {};
  for (const [rawKey, rawVal] of Object.entries(rawRow)) {
    const key = norm(rawKey);
    const mapped = aliases[key];
    if (mapped) {
      (result as Record<string, unknown>)[mapped as string] = typeof rawVal === "string" ? rawVal.trim() : rawVal;
    }
  }
  return result;
}

function toNum(v: unknown, fallback = 0): number {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? fallback : n;
}

// ─── Parse functions ──────────────────────────────────────────────────────────

export function parseCustomers(file: File): Promise<ParseResult<CustomerRow>> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data: CustomerRow[] = [];
        const errors: RowError[] = [];
        (results.data as Record<string, unknown>[]).forEach((raw, i) => {
          const row = aliasRow<CustomerRow>(raw, CUSTOMER_ALIASES);
          if (!row.name) {
            errors.push({ row: i + 2, message: "Missing required field: name" });
            return;
          }
          data.push({ name: row.name, phone: row.phone, email: row.email, address: row.address, city: row.city, state: row.state, zip: row.zip, notes: row.notes, source: row.source });
        });
        resolve({ data, errors });
      },
    });
  });
}

export function parseVehicles(file: File): Promise<ParseResult<VehicleRow>> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data: VehicleRow[] = [];
        const errors: RowError[] = [];
        (results.data as Record<string, unknown>[]).forEach((raw, i) => {
          const row = aliasRow<VehicleRow>(raw, VEHICLE_ALIASES);
          if (!row.customerName) { errors.push({ row: i + 2, message: "Missing customer name" }); return; }
          if (!row.year || !row.make || !row.model) { errors.push({ row: i + 2, message: "Missing year, make, or model" }); return; }
          data.push({
            customerName: row.customerName,
            year: String(row.year),
            make: row.make,
            model: row.model,
            trim: row.trim,
            vin: row.vin,
            licensePlate: row.licensePlate,
            color: row.color,
            mileage: row.mileage !== undefined ? toNum(row.mileage) : undefined,
            engine: row.engine,
            transmission: row.transmission,
            notes: row.notes,
          });
        });
        resolve({ data, errors });
      },
    });
  });
}

export function parseParts(file: File): Promise<ParseResult<PartRow>> {
  return new Promise((resolve) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data: PartRow[] = [];
        const errors: RowError[] = [];
        (results.data as Record<string, unknown>[]).forEach((raw, i) => {
          const row = aliasRow<PartRow>(raw, PART_ALIASES);
          if (!row.name) { errors.push({ row: i + 2, message: "Missing required field: name" }); return; }
          data.push({
            name: row.name,
            sku: row.sku,
            partNumber: row.partNumber,
            description: row.description,
            category: row.category,
            stockQty: toNum(row.stockQty, 0),
            lowStockThreshold: toNum(row.lowStockThreshold, 2),
            unitCost: toNum(row.unitCost, 0),
            unitPrice: toNum(row.unitPrice, 0),
            supplier: row.supplier,
            location: row.location,
          });
        });
        resolve({ data, errors });
      },
    });
  });
}

export function parseFile(type: ImportType, file: File): Promise<ParseResult<ParsedRow>> {
  if (type === "customers") return parseCustomers(file) as Promise<ParseResult<ParsedRow>>;
  if (type === "vehicles") return parseVehicles(file) as Promise<ParseResult<ParsedRow>>;
  return parseParts(file) as Promise<ParseResult<ParsedRow>>;
}
