import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditColumns,
  customerSourceEnum,
  primaryId,
  ts,
} from "./_shared.js";
import { organizations } from "./tenancy.js";

export const customers = pgTable(
  "customers",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    /** Generated so search and display do not have to concatenate at runtime. */
    fullName: text("full_name")
      .notNull()
      .generatedAlwaysAs(
        sql`trim(both from coalesce(first_name, '') || ' ' || coalesce(last_name, ''))`,
      ),

    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    zip: text("zip"),
    notes: text("notes"),

    source: customerSourceEnum("source"),
    smsOptOut: boolean("sms_opt_out").notNull().default(false),
    emailOptOut: boolean("email_opt_out").notNull().default(false),

    lastVisitAt: ts("last_visit_at"),
    /** Soft delete keeps historical repair orders and invoices intact. */
    deletedAt: ts("deleted_at"),
    ...auditColumns(),
  },
  (table) => [
    index("customers_org_idx").on(table.orgId),
    index("customers_org_name_idx").on(table.orgId, table.lastName, table.firstName),
    index("customers_org_phone_idx").on(table.orgId, table.phone),
    index("customers_org_email_idx").on(table.orgId, table.email),
    // Trigram index for fuzzy name search; requires the pg_trgm extension.
    index("customers_name_trgm_idx")
      .using("gin", sql`${table.fullName} gin_trgm_ops`),
  ],
);

export const vehicles = pgTable(
  "vehicles",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),

    year: integer("year"),
    make: text("make"),
    model: text("model"),
    trim: text("trim"),
    /** Stored uppercase and validated to 17 characters when present. */
    vin: text("vin"),
    licensePlate: text("license_plate"),
    licenseState: text("license_state"),
    color: text("color"),
    engine: text("engine"),
    transmission: text("transmission"),
    mileage: integer("mileage"),
    notes: text("notes"),

    deletedAt: ts("deleted_at"),
    ...auditColumns(),
  },
  (table) => [
    index("vehicles_org_idx").on(table.orgId),
    index("vehicles_customer_idx").on(table.customerId),
    uniqueIndex("vehicles_org_vin_key").on(table.orgId, table.vin),
    index("vehicles_org_plate_idx").on(table.orgId, table.licensePlate),
  ],
);

export const customersRelations = relations(customers, ({ one, many }) => ({
  org: one(organizations, {
    fields: [customers.orgId],
    references: [organizations.id],
  }),
  vehicles: many(vehicles),
}));

export const vehiclesRelations = relations(vehicles, ({ one }) => ({
  org: one(organizations, {
    fields: [vehicles.orgId],
    references: [organizations.id],
  }),
  customer: one(customers, {
    fields: [vehicles.customerId],
    references: [customers.id],
  }),
}));
