import { relations, sql } from "drizzle-orm";
import {
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
  deductionStatusEnum,
  deductionTypeEnum,
  employmentTypeEnum,
  money,
  primaryId,
  ts,
} from "./_shared.js";
import { invoices } from "./billing.js";
import { repairOrders } from "./operations.js";
import { orgMembers, organizations } from "./tenancy.js";

export const timeEntries = pgTable(
  "time_entries",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),

    clockInAt: ts("clock_in_at").notNull(),
    clockOutAt: ts("clock_out_at"),
    /** Stored in minutes; derived on clock-out. */
    totalMinutes: integer("total_minutes"),

    clockInLat: doublePrecision("clock_in_lat"),
    clockInLng: doublePrecision("clock_in_lng"),
    clockOutLat: doublePrecision("clock_out_lat"),
    clockOutLng: doublePrecision("clock_out_lng"),

    notes: text("notes"),
    ...auditColumns(),
  },
  (table) => [
    index("time_entries_member_idx").on(table.memberId, table.clockInAt),
    index("time_entries_org_idx").on(table.orgId, table.clockInAt),
    /** At most one open shift per member. */
    uniqueIndex("time_entries_one_open_per_member")
      .on(table.memberId)
      .where(sql`clock_out_at is null`),
    check(
      "time_entries_interval",
      sql`clock_out_at is null or clock_out_at >= clock_in_at`,
    ),
  ],
);

export const locationPings = pgTable(
  "location_pings",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id").references(() => repairOrders.id, {
      onDelete: "set null",
    }),

    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    accuracyMeters: doublePrecision("accuracy_meters"),
    recordedAt: ts("recorded_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("location_pings_member_idx").on(table.memberId, table.recordedAt),
    index("location_pings_org_idx").on(table.orgId, table.recordedAt),
  ],
);

/**
 * Technician pay earned from a settled invoice.
 *
 * Unique on (repair order, member) so re-running settlement — a webhook replay,
 * a manual retry — cannot pay the same labor twice.
 */
export const technicianPayRecords = pgTable(
  "technician_pay_records",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrders.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),

    laborHoursHundredths: integer("labor_hours_hundredths").notNull().default(0),
    laborBilledCents: money("labor_billed_cents").notNull().default(0),
    payCents: money("pay_cents").notNull().default(0),

    /** Snapshot, since a member's employment type can change later. */
    employmentType: employmentTypeEnum("employment_type"),
    earnedAt: ts("earned_at")
      .notNull()
      .default(sql`now()`),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("tech_pay_ro_member_key").on(table.repairOrderId, table.memberId),
    index("tech_pay_member_idx").on(table.memberId, table.earnedAt),
    index("tech_pay_org_idx").on(table.orgId, table.earnedAt),
  ],
);

export const payrollDeductions = pgTable(
  "payroll_deductions",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),

    type: deductionTypeEnum("type").notNull(),
    description: text("description"),
    totalCents: money("total_cents").notNull(),
    perPaycheckCents: money("per_paycheck_cents").notNull().default(0),
    /** Maintained alongside each payment row. */
    paidCents: money("paid_cents").notNull().default(0),
    remainingCents: money("remaining_cents").generatedAlwaysAs(
      sql`total_cents - paid_cents`,
    ),

    status: deductionStatusEnum("status").notNull().default("active"),
    ...auditColumns(),
  },
  (table) => [
    index("payroll_deductions_member_idx").on(table.memberId, table.status),
    check("payroll_deductions_paid_range", sql`paid_cents between 0 and total_cents`),
  ],
);

export const deductionPayments = pgTable(
  "deduction_payments",
  {
    id: primaryId(),
    deductionId: uuid("deduction_id")
      .notNull()
      .references(() => payrollDeductions.id, { onDelete: "cascade" }),

    amountCents: money("amount_cents").notNull(),
    paidAt: ts("paid_at")
      .notNull()
      .default(sql`now()`),
    note: text("note"),
    ...auditColumns(),
  },
  (table) => [
    index("deduction_payments_deduction_idx").on(table.deductionId, table.paidAt),
    check("deduction_payments_amount_positive", sql`amount_cents > 0`),
  ],
);

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  member: one(orgMembers, {
    fields: [timeEntries.memberId],
    references: [orgMembers.id],
  }),
}));

export const technicianPayRecordsRelations = relations(
  technicianPayRecords,
  ({ one }) => ({
    member: one(orgMembers, {
      fields: [technicianPayRecords.memberId],
      references: [orgMembers.id],
    }),
    repairOrder: one(repairOrders, {
      fields: [technicianPayRecords.repairOrderId],
      references: [repairOrders.id],
    }),
  }),
);

export const payrollDeductionsRelations = relations(
  payrollDeductions,
  ({ one, many }) => ({
    member: one(orgMembers, {
      fields: [payrollDeductions.memberId],
      references: [orgMembers.id],
    }),
    payments: many(deductionPayments),
  }),
);
