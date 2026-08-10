import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditColumns,
  bookingStatusEnum,
  primaryId,
  socialPlatformEnum,
  socialPostStatusEnum,
  ts,
} from "./_shared.js";
import { customers, vehicles } from "./crm.js";
import { repairOrders } from "./operations.js";
import { locations, organizations } from "./tenancy.js";

export const bookingRequests = pgTable(
  "booking_requests",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),

    customerName: text("customer_name").notNull(),
    phone: text("phone"),
    email: text("email"),

    vehicleYear: integer("vehicle_year"),
    vehicleMake: text("vehicle_make"),
    vehicleModel: text("vehicle_model"),
    vehicleVin: text("vehicle_vin"),

    concern: text("concern"),
    preferredAt: ts("preferred_at"),
    status: bookingStatusEnum("status").notNull().default("pending"),

    /** Set when a booking is turned into a real job. */
    convertedRepairOrderId: uuid("converted_repair_order_id").references(
      () => repairOrders.id,
      { onDelete: "set null" },
    ),
    matchedCustomerId: uuid("matched_customer_id").references(
      () => customers.id,
      { onDelete: "set null" },
    ),
    matchedVehicleId: uuid("matched_vehicle_id").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    /**
     * Salted hash of the submitter's IP. The booking form is public, so this
     * supports rate limiting and abuse triage without retaining raw addresses.
     */
    submitterIpHash: text("submitter_ip_hash"),
    reviewedAt: ts("reviewed_at"),
    reviewNotes: text("review_notes"),
    ...auditColumns(),
  },
  (table) => [
    index("booking_requests_org_status_idx").on(table.orgId, table.status),
    index("booking_requests_org_created_idx").on(table.orgId, table.createdAt),
    index("booking_requests_ip_idx").on(table.submitterIpHash, table.createdAt),
  ],
);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    platform: socialPlatformEnum("platform").notNull(),
    topic: text("topic"),
    content: text("content").notNull(),
    hashtags: text("hashtags").array().notNull().default(sql`'{}'::text[]`),

    status: socialPostStatusEnum("status").notNull().default("draft"),
    scheduledFor: ts("scheduled_for"),
    publishedAt: ts("published_at"),
    generatedByAi: boolean("generated_by_ai").notNull().default(false),
    ...auditColumns(),
  },
  (table) => [
    index("social_posts_org_idx").on(table.orgId, table.status),
    index("social_posts_scheduled_idx")
      .on(table.scheduledFor)
      .where(sql`status = 'scheduled'`),
  ],
);

export const bookingRequestsRelations = relations(
  bookingRequests,
  ({ one }) => ({
    org: one(organizations, {
      fields: [bookingRequests.orgId],
      references: [organizations.id],
    }),
    convertedRepairOrder: one(repairOrders, {
      fields: [bookingRequests.convertedRepairOrderId],
      references: [repairOrders.id],
    }),
  }),
);
