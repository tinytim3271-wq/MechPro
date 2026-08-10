import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditColumns,
  authorizationMethodEnum,
  bps,
  inspectionResultEnum,
  money,
  photoTypeEnum,
  primaryId,
  recommendationStatusEnum,
  repairOrderPriorityEnum,
  repairOrderStatusEnum,
  techLocationStatusEnum,
  ts,
} from "./_shared.js";
import { customers, vehicles } from "./crm.js";
import { parts } from "./inventory.js";
import { bays, locations, orgMembers, organizations } from "./tenancy.js";

// ---------------------------------------------------------------------------
// Repair orders
// ---------------------------------------------------------------------------

export const repairOrders = pgTable(
  "repair_orders",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),

    /** Allocated from a per-org counter under a row lock; see `counters`. */
    roNumber: integer("ro_number").notNull(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicles.id, { onDelete: "restrict" }),
    assignedToMemberId: uuid("assigned_to_member_id").references(
      () => orgMembers.id,
      { onDelete: "set null" },
    ),
    bayId: uuid("bay_id").references(() => bays.id, { onDelete: "set null" }),

    status: repairOrderStatusEnum("status").notNull().default("estimate"),
    priority: repairOrderPriorityEnum("priority").notNull().default("normal"),

    isMobile: boolean("is_mobile").notNull().default(false),
    serviceAddress: text("service_address"),
    serviceLat: doublePrecision("service_lat"),
    serviceLng: doublePrecision("service_lng"),
    techLocationStatus: techLocationStatusEnum("tech_location_status"),

    /** The classic three C's. */
    complaint: text("complaint"),
    cause: text("cause"),
    correction: text("correction"),

    mileageIn: integer("mileage_in"),
    mileageOut: integer("mileage_out"),

    scheduledAt: ts("scheduled_at"),
    promisedAt: ts("promised_at"),
    startedAt: ts("started_at"),
    completedAt: ts("completed_at"),

    // --- Customer authorization -------------------------------------------
    authorizationMethod: authorizationMethodEnum("authorization_method"),
    authorizedByName: text("authorized_by_name"),
    authorizedAt: ts("authorized_at"),
    signatureFileId: uuid("signature_file_id"),

    /**
     * Only a SHA-256 hash of the public approval token is stored. A leaked
     * database backup therefore cannot be used to approve work, and the token
     * itself exists solely in the link sent to the customer.
     */
    approvalTokenHash: text("approval_token_hash"),
    approvalTokenExpiresAt: ts("approval_token_expires_at"),

    // --- Money snapshot ----------------------------------------------------
    // Derived from the line tables and recomputed in the same transaction as
    // any line change, so a repair order row is self-consistent on its own.
    laborSubtotalCents: money("labor_subtotal_cents").notNull().default(0),
    partsSubtotalCents: money("parts_subtotal_cents").notNull().default(0),
    feesSubtotalCents: money("fees_subtotal_cents").notNull().default(0),
    discountCents: money("discount_cents").notNull().default(0),
    taxRateBps: bps("tax_rate_bps").notNull().default(0),
    taxCents: money("tax_cents").notNull().default(0),
    totalCents: money("total_cents").notNull().default(0),

    carfaxReportedAt: ts("carfax_reported_at"),

    aiWorkflowStatus: text("ai_workflow_status"),
    aiAmbiguityFlag: boolean("ai_ambiguity_flag").notNull().default(false),

    deletedAt: ts("deleted_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("repair_orders_org_number_key").on(table.orgId, table.roNumber),
    index("repair_orders_org_status_idx").on(table.orgId, table.status),
    index("repair_orders_customer_idx").on(table.customerId),
    index("repair_orders_vehicle_idx").on(table.vehicleId),
    index("repair_orders_assigned_idx").on(table.assignedToMemberId),
    // Location filtering happens in SQL, not after pagination as it did before.
    index("repair_orders_org_location_idx").on(table.orgId, table.locationId),
    index("repair_orders_scheduled_idx").on(table.orgId, table.scheduledAt),
    check("repair_orders_totals_non_negative", sql`total_cents >= 0`),
  ],
);

/**
 * Labor lines.
 *
 * Hours are stored as integer hundredths (1.5 h -> 150) for the same reason
 * money is stored in cents: `hours * rate` must land on an exact cent.
 */
export const repairOrderLaborLines = pgTable(
  "repair_order_labor_lines",
  {
    id: primaryId(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    description: text("description").notNull(),
    hoursHundredths: integer("hours_hundredths").notNull().default(0),
    rateCents: money("rate_cents").notNull().default(0),
    amountCents: money("amount_cents").notNull().default(0),

    /** Credited for technician pay when the invoice is settled. */
    performedByMemberId: uuid("performed_by_member_id").references(
      () => orgMembers.id,
      { onDelete: "set null" },
    ),

    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    index("ro_labor_lines_ro_idx").on(table.repairOrderId, table.sortOrder),
    index("ro_labor_lines_member_idx").on(table.performedByMemberId),
  ],
);

export const repairOrderPartLines = pgTable(
  "repair_order_part_lines",
  {
    id: primaryId(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    /**
     * A real foreign key. The original stored the id as a loose string and
     * wrapped every dereference in try/catch.
     */
    partId: uuid("part_id").references(() => parts.id, { onDelete: "set null" }),

    description: text("description").notNull(),
    partNumber: text("part_number"),
    quantity: integer("quantity").notNull().default(1),
    unitCostCents: money("unit_cost_cents").notNull().default(0),
    unitPriceCents: money("unit_price_cents").notNull().default(0),
    amountCents: money("amount_cents").notNull().default(0),

    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    index("ro_part_lines_ro_idx").on(table.repairOrderId, table.sortOrder),
    index("ro_part_lines_part_idx").on(table.partId),
    check("ro_part_lines_quantity_positive", sql`quantity > 0`),
  ],
);

export const repairOrderFees = pgTable(
  "repair_order_fees",
  {
    id: primaryId(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    label: text("label").notNull(),
    /** "percent" fees derive from a base; "flat" fees are a fixed amount. */
    kind: text("kind").notNull().default("flat"),
    rateBps: bps("rate_bps"),
    capCents: money("cap_cents"),
    amountCents: money("amount_cents").notNull().default(0),
    isTaxable: boolean("is_taxable").notNull().default(true),

    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    index("ro_fees_ro_idx").on(table.repairOrderId, table.sortOrder),
    check("ro_fees_kind", sql`kind in ('flat', 'percent')`),
  ],
);

export const laborMatrix = pgTable(
  "labor_matrix",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    category: text("category").notNull(),
    description: text("description").notNull(),
    hoursHundredths: integer("hours_hundredths").notNull(),

    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [index("labor_matrix_org_idx").on(table.orgId, table.category)],
);

// ---------------------------------------------------------------------------
// Shop-floor collaboration
// ---------------------------------------------------------------------------

export const inspections = pgTable(
  "inspections",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    templateName: text("template_name").notNull().default("multi_point"),
    performedByMemberId: uuid("performed_by_member_id").references(
      () => orgMembers.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    completedAt: ts("completed_at"),
    ...auditColumns(),
  },
  (table) => [index("inspections_ro_idx").on(table.repairOrderId)],
);

export const inspectionItems = pgTable(
  "inspection_items",
  {
    id: primaryId(),
    inspectionId: uuid("inspection_id")
      .notNull()
      .references(() => inspections.id, { onDelete: "cascade" }),

    category: text("category").notNull(),
    label: text("label").notNull(),
    result: inspectionResultEnum("result").notNull().default("not_applicable"),
    notes: text("notes"),
    measurement: text("measurement"),
    fileId: uuid("file_id"),

    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    index("inspection_items_inspection_idx").on(
      table.inspectionId,
      table.sortOrder,
    ),
  ],
);

export const repairOrderPhotos = pgTable(
  "repair_order_photos",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    fileId: uuid("file_id").notNull(),
    photoType: photoTypeEnum("photo_type").notNull(),
    caption: text("caption"),
    uploadedByMemberId: uuid("uploaded_by_member_id").references(
      () => orgMembers.id,
      { onDelete: "set null" },
    ),
    ...auditColumns(),
  },
  (table) => [
    index("ro_photos_ro_idx").on(table.repairOrderId, table.photoType),
  ],
);

export const repairOrderMessages = pgTable(
  "repair_order_messages",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    authorMemberId: uuid("author_member_id").references(() => orgMembers.id, {
      onDelete: "set null",
    }),
    /** "office", "tech", or "system" for automated entries. */
    authorKind: text("author_kind").notNull(),
    body: text("body").notNull(),

    readByOfficeAt: ts("read_by_office_at"),
    readByTechAt: ts("read_by_tech_at"),
    ...auditColumns(),
  },
  (table) => [
    index("ro_messages_ro_idx").on(table.repairOrderId, table.createdAt),
    check(
      "ro_messages_author_kind",
      sql`author_kind in ('office', 'tech', 'system')`,
    ),
  ],
);

export const technicianRecommendations = pgTable(
  "technician_recommendations",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),

    recommendedByMemberId: uuid("recommended_by_member_id").references(
      () => orgMembers.id,
      { onDelete: "set null" },
    ),
    title: text("title").notNull(),
    details: text("details"),
    urgency: text("urgency"),
    estimatedHoursHundredths: integer("estimated_hours_hundredths"),
    estimatedPartsCents: money("estimated_parts_cents"),

    status: recommendationStatusEnum("status").notNull().default("pending"),
    decidedAt: ts("decided_at"),
    ...auditColumns(),
  },
  (table) => [
    index("tech_recommendations_ro_idx").on(table.repairOrderId, table.status),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const repairOrdersRelations = relations(
  repairOrders,
  ({ one, many }) => ({
    org: one(organizations, {
      fields: [repairOrders.orgId],
      references: [organizations.id],
    }),
    location: one(locations, {
      fields: [repairOrders.locationId],
      references: [locations.id],
    }),
    customer: one(customers, {
      fields: [repairOrders.customerId],
      references: [customers.id],
    }),
    vehicle: one(vehicles, {
      fields: [repairOrders.vehicleId],
      references: [vehicles.id],
    }),
    assignedTo: one(orgMembers, {
      fields: [repairOrders.assignedToMemberId],
      references: [orgMembers.id],
    }),
    bay: one(bays, { fields: [repairOrders.bayId], references: [bays.id] }),
    laborLines: many(repairOrderLaborLines),
    partLines: many(repairOrderPartLines),
    fees: many(repairOrderFees),
    photos: many(repairOrderPhotos),
    messages: many(repairOrderMessages),
    inspections: many(inspections),
    recommendations: many(technicianRecommendations),
  }),
);

export const repairOrderLaborLinesRelations = relations(
  repairOrderLaborLines,
  ({ one }) => ({
    repairOrder: one(repairOrders, {
      fields: [repairOrderLaborLines.repairOrderId],
      references: [repairOrders.id],
    }),
    performedBy: one(orgMembers, {
      fields: [repairOrderLaborLines.performedByMemberId],
      references: [orgMembers.id],
    }),
  }),
);

export const repairOrderPartLinesRelations = relations(
  repairOrderPartLines,
  ({ one }) => ({
    repairOrder: one(repairOrders, {
      fields: [repairOrderPartLines.repairOrderId],
      references: [repairOrders.id],
    }),
    part: one(parts, {
      fields: [repairOrderPartLines.partId],
      references: [parts.id],
    }),
  }),
);

export const repairOrderFeesRelations = relations(
  repairOrderFees,
  ({ one }) => ({
    repairOrder: one(repairOrders, {
      fields: [repairOrderFees.repairOrderId],
      references: [repairOrders.id],
    }),
  }),
);

export const inspectionsRelations = relations(inspections, ({ one, many }) => ({
  repairOrder: one(repairOrders, {
    fields: [inspections.repairOrderId],
    references: [repairOrders.id],
  }),
  items: many(inspectionItems),
}));

export const inspectionItemsRelations = relations(
  inspectionItems,
  ({ one }) => ({
    inspection: one(inspections, {
      fields: [inspectionItems.inspectionId],
      references: [inspections.id],
    }),
  }),
);
