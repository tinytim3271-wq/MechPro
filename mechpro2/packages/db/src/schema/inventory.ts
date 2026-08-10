import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  auditColumns,
  inventoryMovementReasonEnum,
  money,
  primaryId,
  purchaseOrderStatusEnum,
  ts,
} from "./_shared.js";
import { organizations } from "./tenancy.js";

export const suppliers = pgTable(
  "suppliers",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    accountNumber: text("account_number"),
    notes: text("notes"),

    isActive: boolean("is_active").notNull().default(true),
    ...auditColumns(),
  },
  (table) => [index("suppliers_org_idx").on(table.orgId, table.name)],
);

export const parts = pgTable(
  "parts",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    partNumber: text("part_number"),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),

    costCents: money("cost_cents").notNull().default(0),
    priceCents: money("price_cents").notNull().default(0),

    /**
     * Denormalized running total, always written in the same transaction as an
     * `inventory_movements` row. The ledger is the source of truth; this column
     * exists so the common read does not have to aggregate. A test asserts the
     * two never disagree.
     */
    stockOnHand: integer("stock_on_hand").notNull().default(0),

    /** Non-inventoried parts (shop rags, fluids by the ounce) skip the ledger. */
    isInventoried: boolean("is_inventoried").notNull().default(true),
    reorderPoint: integer("reorder_point").notNull().default(0),
    reorderQuantity: integer("reorder_quantity").notNull().default(0),

    preferredSupplierId: uuid("preferred_supplier_id").references(
      () => suppliers.id,
      { onDelete: "set null" },
    ),
    binLocation: text("bin_location"),

    isActive: boolean("is_active").notNull().default(true),
    deletedAt: ts("deleted_at"),
    ...auditColumns(),
  },
  (table) => [
    index("parts_org_idx").on(table.orgId),
    uniqueIndex("parts_org_part_number_key").on(table.orgId, table.partNumber),
    index("parts_org_name_idx").on(table.orgId, table.name),
    index("parts_name_trgm_idx").using("gin", sql`${table.name} gin_trgm_ops`),
    // Cheap index for the low-stock dashboard widget.
    index("parts_low_stock_idx")
      .on(table.orgId)
      .where(sql`is_inventoried and stock_on_hand <= reorder_point`),
    check("parts_stock_non_negative", sql`stock_on_hand >= 0`),
  ],
);

/**
 * Append-only inventory ledger.
 *
 * Every change to on-hand quantity is one row here, tagged with why it moved
 * and what caused it. The original mutated a counter from three different call
 * sites, which is how stock ended up deducted twice for a single job — once
 * when the parts were added to the repair order and again when it was invoiced.
 * With a ledger keyed by (reason, reference) that double-count is a uniqueness
 * violation rather than a silent loss.
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    partId: uuid("part_id")
      .notNull()
      .references(() => parts.id, { onDelete: "cascade" }),

    /** Signed: negative consumes stock, positive returns or receives it. */
    delta: integer("delta").notNull(),
    reason: inventoryMovementReasonEnum("reason").notNull(),

    /** What caused the movement, e.g. "repair_order" / "purchase_order". */
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),

    unitCostCents: money("unit_cost_cents"),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("inventory_movements_part_idx").on(table.partId, table.createdAt),
    index("inventory_movements_org_idx").on(table.orgId, table.createdAt),
    index("inventory_movements_reference_idx").on(
      table.referenceType,
      table.referenceId,
    ),
    /**
     * One movement per (part, reason, reference). Attempting to consume the
     * same repair order's parts twice raises a unique violation instead of
     * quietly halving inventory.
     */
    uniqueIndex("inventory_movements_dedupe_key")
      .on(table.partId, table.reason, table.referenceType, table.referenceId)
      .where(sql`reference_id is not null`),
    check("inventory_movements_delta_nonzero", sql`delta <> 0`),
  ],
);

export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id").references(() => suppliers.id, {
      onDelete: "set null",
    }),

    /** Allocated from a per-org counter, so concurrent creates cannot collide. */
    poNumber: text("po_number").notNull(),
    status: purchaseOrderStatusEnum("status").notNull().default("draft"),

    notes: text("notes"),
    generatedByAi: boolean("generated_by_ai").notNull().default(false),

    orderedAt: ts("ordered_at"),
    expectedAt: ts("expected_at"),
    receivedAt: ts("received_at"),
    ...auditColumns(),
  },
  (table) => [
    index("purchase_orders_org_idx").on(table.orgId, table.status),
    uniqueIndex("purchase_orders_org_number_key").on(table.orgId, table.poNumber),
  ],
);

export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: primaryId(),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrders.id, { onDelete: "cascade" }),
    partId: uuid("part_id").references(() => parts.id, { onDelete: "set null" }),

    description: text("description").notNull(),
    partNumber: text("part_number"),

    quantityOrdered: integer("quantity_ordered").notNull(),
    quantityReceived: integer("quantity_received").notNull().default(0),
    unitCostCents: money("unit_cost_cents").notNull().default(0),

    sortOrder: integer("sort_order").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    index("purchase_order_lines_po_idx").on(
      table.purchaseOrderId,
      table.sortOrder,
    ),
    check(
      "purchase_order_lines_quantities",
      sql`quantity_ordered > 0 and quantity_received >= 0 and quantity_received <= quantity_ordered`,
    ),
  ],
);

export const partsRelations = relations(parts, ({ one, many }) => ({
  org: one(organizations, {
    fields: [parts.orgId],
    references: [organizations.id],
  }),
  preferredSupplier: one(suppliers, {
    fields: [parts.preferredSupplierId],
    references: [suppliers.id],
  }),
  movements: many(inventoryMovements),
}));

export const inventoryMovementsRelations = relations(
  inventoryMovements,
  ({ one }) => ({
    part: one(parts, {
      fields: [inventoryMovements.partId],
      references: [parts.id],
    }),
  }),
);

export const purchaseOrdersRelations = relations(
  purchaseOrders,
  ({ one, many }) => ({
    supplier: one(suppliers, {
      fields: [purchaseOrders.supplierId],
      references: [suppliers.id],
    }),
    lines: many(purchaseOrderLines),
  }),
);

export const purchaseOrderLinesRelations = relations(
  purchaseOrderLines,
  ({ one }) => ({
    purchaseOrder: one(purchaseOrders, {
      fields: [purchaseOrderLines.purchaseOrderId],
      references: [purchaseOrders.id],
    }),
    part: one(parts, {
      fields: [purchaseOrderLines.partId],
      references: [parts.id],
    }),
  }),
);
