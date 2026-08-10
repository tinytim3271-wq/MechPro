import {
  BookingStatus,
  CustomerSource,
  DeductionStatus,
  DeductionType,
  EmploymentType,
  InspectionResult,
  InventoryMovementReason,
  InviteStatus,
  InvoiceStatus,
  JobStatus,
  MemberRole,
  PaymentMethod,
  PhotoType,
  PurchaseOrderStatus,
  RecommendationStatus,
  RepairOrderPriority,
  RepairOrderStatus,
  SocialPlatform,
  SocialPostStatus,
  SubscriptionStatus,
  TechLocationStatus,
  AuthorizationMethod,
} from "@mechpro/shared";
import { bigint, integer, pgEnum, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** pgEnum wants a mutable tuple; the shared definitions are readonly. */
function pgEnumFrom<T extends readonly [string, ...string[]]>(
  name: string,
  values: T,
) {
  return pgEnum(name, values as unknown as [string, ...string[]]);
}

// ---------------------------------------------------------------------------
// Column conventions
// ---------------------------------------------------------------------------

/**
 * Monetary column. Always an integer count of cents, never a float.
 *
 * `bigint` in "number" mode is exact up to 2^53 cents, which is far beyond any
 * plausible invoice, and avoids the BigInt ergonomics tax at the call site.
 */
export const money = (name: string) => bigint(name, { mode: "number" });

/** A rate in basis points. 825 === 8.25%. */
export const bps = (name: string) => integer(name);

/** Every timestamp is timezone-aware; the original stored float epochs. */
export const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });

export const primaryId = () => uuid("id").primaryKey();

export const createdAt = () =>
  ts("created_at")
    .notNull()
    .default(sql`now()`);

export const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .default(sql`now()`);

/** Standard audit columns applied to every table. */
export const auditColumns = () => ({
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Postgres enum types
// ---------------------------------------------------------------------------

export const repairOrderStatusEnum = pgEnumFrom(
  "repair_order_status",
  RepairOrderStatus.values,
);
export const repairOrderPriorityEnum = pgEnumFrom(
  "repair_order_priority",
  RepairOrderPriority.values,
);
export const authorizationMethodEnum = pgEnumFrom(
  "authorization_method",
  AuthorizationMethod.values,
);
export const techLocationStatusEnum = pgEnumFrom(
  "tech_location_status",
  TechLocationStatus.values,
);
export const invoiceStatusEnum = pgEnumFrom(
  "invoice_status",
  InvoiceStatus.values,
);
export const paymentMethodEnum = pgEnumFrom(
  "payment_method",
  PaymentMethod.values,
);
export const memberRoleEnum = pgEnumFrom("member_role", MemberRole.values);
export const inviteStatusEnum = pgEnumFrom("invite_status", InviteStatus.values);
export const employmentTypeEnum = pgEnumFrom(
  "employment_type",
  EmploymentType.values,
);
export const purchaseOrderStatusEnum = pgEnumFrom(
  "purchase_order_status",
  PurchaseOrderStatus.values,
);
export const inventoryMovementReasonEnum = pgEnumFrom(
  "inventory_movement_reason",
  InventoryMovementReason.values,
);
export const photoTypeEnum = pgEnumFrom("photo_type", PhotoType.values);
export const inspectionResultEnum = pgEnumFrom(
  "inspection_result",
  InspectionResult.values,
);
export const recommendationStatusEnum = pgEnumFrom(
  "recommendation_status",
  RecommendationStatus.values,
);
export const bookingStatusEnum = pgEnumFrom(
  "booking_status",
  BookingStatus.values,
);
export const customerSourceEnum = pgEnumFrom(
  "customer_source",
  CustomerSource.values,
);
export const deductionTypeEnum = pgEnumFrom(
  "deduction_type",
  DeductionType.values,
);
export const deductionStatusEnum = pgEnumFrom(
  "deduction_status",
  DeductionStatus.values,
);
export const socialPlatformEnum = pgEnumFrom(
  "social_platform",
  SocialPlatform.values,
);
export const socialPostStatusEnum = pgEnumFrom(
  "social_post_status",
  SocialPostStatus.values,
);
export const subscriptionStatusEnum = pgEnumFrom(
  "subscription_status",
  SubscriptionStatus.values,
);
export const jobStatusEnum = pgEnumFrom("job_status", JobStatus.values);
