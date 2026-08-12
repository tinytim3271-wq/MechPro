"use node";

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { api, internal } from "./_generated/api";
import Papa from "papaparse";

// ─── Column mapping helpers ───────────────────────────────────────────────────

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const val = row[k]?.toString().trim();
    if (val) return val;
  }
  return "";
}

function pickNum(row: Record<string, string>, ...keys: string[]): number {
  for (const k of keys) {
    const val = parseFloat(row[k] ?? "");
    if (!isNaN(val)) return val;
  }
  return 0;
}

// ─── Import Customers ─────────────────────────────────────────────────────────

export const importCustomers = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      // Support many column name variations from different shop software
      const name = pick(
        row,
        "name", "customer_name", "full_name", "client_name",
        "first_name", "firstname", "last_name", "lastname"
      );

      // Combine first+last if name is empty
      const firstName = pick(row, "first_name", "firstname", "fname");
      const lastName = pick(row, "last_name", "lastname", "lname");
      const fullName = name || [firstName, lastName].filter(Boolean).join(" ");

      if (!fullName) {
        errors.push(`Row ${rowNum}: No name found — skipped`);
        skipped++;
        continue;
      }

      try {
        await ctx.runMutation(api.customers.createCustomer, {
          name: fullName,
          phone: pick(row, "phone", "phone_number", "mobile", "cell", "telephone") || undefined,
          email: pick(row, "email", "email_address", "e_mail") || undefined,
          address: pick(row, "address", "street", "street_address", "address_1") || undefined,
          city: pick(row, "city") || undefined,
          state: pick(row, "state", "province") || undefined,
          zip: pick(row, "zip", "zip_code", "postal_code", "postal") || undefined,
          notes: pick(row, "notes", "note", "comments", "comment") || undefined,
          source: "import",
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import "${fullName}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});

// ─── Import Parts ─────────────────────────────────────────────────────────────

export const importParts = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      const name = pick(
        row,
        "name", "part_name", "description", "item_name",
        "product_name", "item_description"
      );

      if (!name) {
        errors.push(`Row ${rowNum}: No part name found — skipped`);
        skipped++;
        continue;
      }

      try {
        await ctx.runMutation(api.parts.createPart, {
          name,
          partNumber: pick(row, "part_number", "part_no", "part#", "item_number", "item_no", "sku", "number") || undefined,
          sku: pick(row, "sku", "item_code", "code", "barcode") || undefined,
          category: pick(row, "category", "type", "group", "part_type", "class") || undefined,
          stockQty: pickNum(row, "stock_qty", "qty", "quantity", "on_hand", "stock", "quantity_on_hand"),
          lowStockThreshold: pickNum(row, "low_stock_threshold", "reorder_point", "min_qty", "reorder_level") || 2,
          unitCost: pickNum(row, "unit_cost", "cost", "purchase_price", "buy_price", "dealer_cost"),
          unitPrice: pickNum(row, "unit_price", "price", "retail_price", "sell_price", "list_price", "sale_price"),
          supplier: pick(row, "supplier", "vendor", "manufacturer", "brand", "source") || undefined,
          location: pick(row, "location", "bin", "shelf", "bin_location", "storage") || undefined,
          description: pick(row, "description", "notes", "long_description") || undefined,
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import "${name}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});

// ─── Import Work Orders ──────────────────────────────────────────────────────

export const importWorkOrders = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      const customerName = pick(row, "customer", "customer_name", "name", "client", "client_name");
      const complaint = pick(row, "complaint", "concern", "description", "service", "work_description", "job_description", "reason");
      const vehicleYear = pick(row, "year", "vehicle_year", "veh_year");
      const vehicleMake = pick(row, "make", "vehicle_make", "veh_make");
      const vehicleModel = pick(row, "model", "vehicle_model", "veh_model");

      if (!customerName) {
        errors.push(`Row ${rowNum}: No customer name found — skipped`);
        skipped++;
        continue;
      }
      if (!complaint) {
        errors.push(`Row ${rowNum}: No complaint/description found — skipped`);
        skipped++;
        continue;
      }
      if (!vehicleYear || !vehicleMake || !vehicleModel) {
        errors.push(`Row ${rowNum}: Missing vehicle year/make/model — skipped`);
        skipped++;
        continue;
      }

      try {
        await ctx.runMutation(internal.importRecords.importWorkOrder, {
          customerName,
          customerPhone: pick(row, "phone", "customer_phone", "mobile") || undefined,
          customerEmail: pick(row, "email", "customer_email") || undefined,
          vehicleYear,
          vehicleMake,
          vehicleModel,
          vin: pick(row, "vin", "vehicle_vin") || undefined,
          licensePlate: pick(row, "license_plate", "plate", "tag", "license") || undefined,
          mileage: pickNum(row, "mileage", "miles", "odometer", "mileage_in") || undefined,
          complaint,
          cause: pick(row, "cause", "diagnosis", "tech_notes") || undefined,
          correction: pick(row, "correction", "repair", "work_performed", "fix") || undefined,
          status: pick(row, "status", "ro_status", "order_status") || undefined,
          priority: pick(row, "priority") || undefined,
          laborDescription: pick(row, "labor_description", "labor", "service_description") || undefined,
          laborHours: pickNum(row, "labor_hours", "hours", "time") || undefined,
          laborRate: pickNum(row, "labor_rate", "rate", "hourly_rate") || undefined,
          partDescription: pick(row, "part_description", "part_name", "part") || undefined,
          partNumber: pick(row, "part_number", "part_no", "part#") || undefined,
          partQty: pickNum(row, "part_qty", "qty", "quantity") || undefined,
          partCost: pickNum(row, "part_cost", "cost") || undefined,
          partPrice: pickNum(row, "part_price", "price") || undefined,
          totalAmount: pickNum(row, "total", "total_amount", "amount", "grand_total") || undefined,
          notes: pick(row, "notes", "internal_notes", "comments") || undefined,
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import work order for "${customerName}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});

// ─── Import Estimates ────────────────────────────────────────────────────────

export const importEstimates = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      const customerName = pick(row, "customer", "customer_name", "name", "client", "client_name");
      const complaint = pick(row, "complaint", "concern", "description", "service", "work_description", "estimate_description");
      const vehicleYear = pick(row, "year", "vehicle_year", "veh_year");
      const vehicleMake = pick(row, "make", "vehicle_make", "veh_make");
      const vehicleModel = pick(row, "model", "vehicle_model", "veh_model");

      if (!customerName) {
        errors.push(`Row ${rowNum}: No customer name found — skipped`);
        skipped++;
        continue;
      }
      if (!complaint) {
        errors.push(`Row ${rowNum}: No description found — skipped`);
        skipped++;
        continue;
      }
      if (!vehicleYear || !vehicleMake || !vehicleModel) {
        errors.push(`Row ${rowNum}: Missing vehicle year/make/model — skipped`);
        skipped++;
        continue;
      }

      try {
        await ctx.runMutation(internal.importRecords.importEstimate, {
          customerName,
          customerPhone: pick(row, "phone", "customer_phone", "mobile") || undefined,
          customerEmail: pick(row, "email", "customer_email") || undefined,
          vehicleYear,
          vehicleMake,
          vehicleModel,
          vin: pick(row, "vin", "vehicle_vin") || undefined,
          licensePlate: pick(row, "license_plate", "plate", "tag") || undefined,
          mileage: pickNum(row, "mileage", "miles", "odometer") || undefined,
          complaint,
          laborDescription: pick(row, "labor_description", "labor", "service_description") || undefined,
          laborHours: pickNum(row, "labor_hours", "hours") || undefined,
          laborRate: pickNum(row, "labor_rate", "rate") || undefined,
          partDescription: pick(row, "part_description", "part_name", "part") || undefined,
          partNumber: pick(row, "part_number", "part_no") || undefined,
          partQty: pickNum(row, "part_qty", "qty") || undefined,
          partCost: pickNum(row, "part_cost", "cost") || undefined,
          partPrice: pickNum(row, "part_price", "price") || undefined,
          totalAmount: pickNum(row, "total", "total_amount", "estimate_total", "amount") || undefined,
          notes: pick(row, "notes", "comments") || undefined,
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import estimate for "${customerName}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});

// ─── Import Invoices ─────────────────────────────────────────────────────────

export const importInvoices = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      const customerName = pick(row, "customer", "customer_name", "name", "client", "bill_to");
      const vehicleYear = pick(row, "year", "vehicle_year");
      const vehicleMake = pick(row, "make", "vehicle_make");
      const vehicleModel = pick(row, "model", "vehicle_model");
      const total = pickNum(row, "total", "invoice_total", "grand_total", "amount", "balance");

      if (!customerName) {
        errors.push(`Row ${rowNum}: No customer name found — skipped`);
        skipped++;
        continue;
      }
      if (!vehicleYear || !vehicleMake || !vehicleModel) {
        errors.push(`Row ${rowNum}: Missing vehicle year/make/model — skipped`);
        skipped++;
        continue;
      }
      if (total <= 0) {
        errors.push(`Row ${rowNum}: No valid total amount — skipped`);
        skipped++;
        continue;
      }

      const subtotal = pickNum(row, "subtotal", "sub_total") || total;
      const taxAmount = pickNum(row, "tax", "tax_amount", "sales_tax");

      try {
        await ctx.runMutation(internal.importRecords.importInvoice, {
          customerName,
          customerPhone: pick(row, "phone", "customer_phone") || undefined,
          customerEmail: pick(row, "email", "customer_email") || undefined,
          vehicleYear,
          vehicleMake,
          vehicleModel,
          vin: pick(row, "vin") || undefined,
          complaint: pick(row, "complaint", "description", "service", "work_description") || "Imported invoice",
          invoiceNumber: pick(row, "invoice_number", "invoice_no", "invoice#", "inv_number") || undefined,
          status: pick(row, "status", "invoice_status", "payment_status") || undefined,
          subtotal,
          taxAmount: taxAmount || undefined,
          total,
          amountPaid: pickNum(row, "amount_paid", "paid", "payment") || undefined,
          issuedAt: pick(row, "issued_at", "invoice_date", "date", "created_date") || undefined,
          dueAt: pick(row, "due_at", "due_date") || undefined,
          notes: pick(row, "notes", "comments", "memo") || undefined,
          laborDescription: pick(row, "labor_description", "labor", "service") || undefined,
          laborHours: pickNum(row, "labor_hours", "hours") || undefined,
          laborRate: pickNum(row, "labor_rate", "rate") || undefined,
          partDescription: pick(row, "part_description", "part_name", "part") || undefined,
          partQty: pickNum(row, "part_qty", "qty") || undefined,
          partPrice: pickNum(row, "part_price", "price") || undefined,
          partCost: pickNum(row, "part_cost", "cost") || undefined,
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import invoice for "${customerName}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});

// ─── Import Purchase Orders ──────────────────────────────────────────────────

export const importPurchaseOrders = action({
  args: { csvContent: v.string() },
  handler: async (ctx, args): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });

    const result = Papa.parse<Record<string, string>>(args.csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/[\s\-/]+/g, "_"),
    });

    const errors: string[] = [];
    let imported = 0;
    let skipped = 0;

    for (let i = 0; i < result.data.length; i++) {
      const row = result.data[i];
      const rowNum = i + 2;

      const supplierName = pick(row, "supplier", "vendor", "supplier_name", "vendor_name", "source");
      const partDescription = pick(row, "part", "part_name", "description", "item", "item_description", "product");
      const qtyOrdered = pickNum(row, "qty_ordered", "qty", "quantity", "order_qty");
      const unitCost = pickNum(row, "unit_cost", "cost", "price", "purchase_price");

      if (!supplierName) {
        errors.push(`Row ${rowNum}: No supplier name found — skipped`);
        skipped++;
        continue;
      }
      if (!partDescription) {
        errors.push(`Row ${rowNum}: No part description found — skipped`);
        skipped++;
        continue;
      }
      if (qtyOrdered <= 0) {
        errors.push(`Row ${rowNum}: No valid quantity — skipped`);
        skipped++;
        continue;
      }

      try {
        await ctx.runMutation(internal.importRecords.importPurchaseOrder, {
          supplierName,
          status: pick(row, "status", "po_status", "order_status") || undefined,
          partDescription,
          partNumber: pick(row, "part_number", "part_no", "item_number") || undefined,
          qtyOrdered,
          qtyReceived: pickNum(row, "qty_received", "received", "received_qty") || undefined,
          unitCost,
          notes: pick(row, "notes", "comments", "memo") || undefined,
          orderedAt: pick(row, "ordered_at", "order_date", "date", "po_date") || undefined,
          expectedAt: pick(row, "expected_at", "expected_date", "eta", "delivery_date") || undefined,
          receivedAt: pick(row, "received_at", "received_date") || undefined,
        });
        imported++;
      } catch {
        errors.push(`Row ${rowNum}: Failed to import PO for "${partDescription}"`);
        skipped++;
      }
    }

    return { imported, skipped, errors };
  },
});
