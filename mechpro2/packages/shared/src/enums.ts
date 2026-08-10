import { z } from "zod";

function enumOf<const T extends readonly [string, ...string[]]>(values: T) {
  return { values, schema: z.enum(values) } as const;
}

// ---------------------------------------------------------------------------
// Repair orders
// ---------------------------------------------------------------------------

export const RepairOrderStatus = enumOf([
  "estimate",
  "approved",
  "in_progress",
  "waiting_parts",
  "completed",
  "invoiced",
  "cancelled",
]);
export type RepairOrderStatus = z.infer<typeof RepairOrderStatus.schema>;

/**
 * Allowed status transitions.
 *
 * The original app let any status be set from any other, which is how an
 * invoiced order could be dragged back to `estimate` and re-invoiced. Making
 * the graph explicit turns that into a rejected transition.
 */
export const REPAIR_ORDER_TRANSITIONS: Readonly<
  Record<RepairOrderStatus, readonly RepairOrderStatus[]>
> = {
  estimate: ["approved", "cancelled"],
  approved: ["in_progress", "waiting_parts", "cancelled"],
  in_progress: ["waiting_parts", "completed", "cancelled"],
  waiting_parts: ["in_progress", "completed", "cancelled"],
  completed: ["invoiced", "in_progress"],
  invoiced: ["completed"],
  cancelled: [],
};

export function canTransition(
  from: RepairOrderStatus,
  to: RepairOrderStatus,
): boolean {
  return REPAIR_ORDER_TRANSITIONS[from].includes(to);
}

export const RepairOrderPriority = enumOf(["low", "normal", "high", "urgent"]);
export type RepairOrderPriority = z.infer<typeof RepairOrderPriority.schema>;

export const AuthorizationMethod = enumOf([
  "in_person_signature",
  "online_approval",
  "phone",
  "email",
]);
export type AuthorizationMethod = z.infer<typeof AuthorizationMethod.schema>;

export const TechLocationStatus = enumOf(["en_route", "on_site", "left_site"]);
export type TechLocationStatus = z.infer<typeof TechLocationStatus.schema>;

// ---------------------------------------------------------------------------
// Invoicing
// ---------------------------------------------------------------------------

export const InvoiceStatus = enumOf([
  "draft",
  "sent",
  "partial",
  "paid",
  "void",
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus.schema>;

export const PaymentMethod = enumOf(["cash", "card", "check", "other"]);
export type PaymentMethod = z.infer<typeof PaymentMethod.schema>;

// ---------------------------------------------------------------------------
// People and access
// ---------------------------------------------------------------------------

export const MemberRole = enumOf([
  "owner",
  "admin",
  "service_writer",
  "mechanic",
  "mobile_mechanic",
]);
export type MemberRole = z.infer<typeof MemberRole.schema>;

/** Roles that may administer the organization, before per-member overrides. */
export const ADMIN_ROLES: readonly MemberRole[] = ["owner", "admin"];

/** Roles whose primary workspace is the technician portal. */
export const TECH_ROLES: readonly MemberRole[] = ["mechanic", "mobile_mechanic"];

export const InviteStatus = enumOf(["pending", "accepted", "revoked"]);
export type InviteStatus = z.infer<typeof InviteStatus.schema>;

export const EmploymentType = enumOf(["w2", "1099"]);
export type EmploymentType = z.infer<typeof EmploymentType.schema>;

// ---------------------------------------------------------------------------
// Inventory and purchasing
// ---------------------------------------------------------------------------

export const PurchaseOrderStatus = enumOf([
  "draft",
  "sent",
  "partial",
  "received",
  "cancelled",
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatus.schema>;

/**
 * Why stock moved. Every change to on-hand quantity is an entry in the
 * inventory ledger tagged with one of these, so stock is always explainable.
 */
export const InventoryMovementReason = enumOf([
  "purchase_received",
  "consumed_by_repair_order",
  "returned_from_repair_order",
  "manual_adjustment",
  "stock_count",
  "merge_consolidation",
]);
export type InventoryMovementReason = z.infer<
  typeof InventoryMovementReason.schema
>;

// ---------------------------------------------------------------------------
// Shop floor
// ---------------------------------------------------------------------------

export const PhotoType = enumOf(["intake", "damage", "during", "complete"]);
export type PhotoType = z.infer<typeof PhotoType.schema>;

export const InspectionResult = enumOf([
  "ok",
  "needs_attention",
  "critical",
  "not_applicable",
]);
export type InspectionResult = z.infer<typeof InspectionResult.schema>;

export const RecommendationStatus = enumOf([
  "pending",
  "approved",
  "declined",
]);
export type RecommendationStatus = z.infer<typeof RecommendationStatus.schema>;

export const BookingStatus = enumOf([
  "pending",
  "confirmed",
  "declined",
  "converted",
]);
export type BookingStatus = z.infer<typeof BookingStatus.schema>;

export const CustomerSource = enumOf([
  "walk_in",
  "phone",
  "online",
  "referral",
  "other",
]);
export type CustomerSource = z.infer<typeof CustomerSource.schema>;

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

export const DeductionType = enumOf(["advance", "uniform", "tools", "other"]);
export type DeductionType = z.infer<typeof DeductionType.schema>;

export const DeductionStatus = enumOf(["active", "paid_off", "cancelled"]);
export type DeductionStatus = z.infer<typeof DeductionStatus.schema>;

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

export const SocialPlatform = enumOf([
  "facebook",
  "instagram",
  "google",
  "general",
]);
export type SocialPlatform = z.infer<typeof SocialPlatform.schema>;

export const SocialPostStatus = enumOf(["draft", "scheduled", "published"]);
export type SocialPostStatus = z.infer<typeof SocialPostStatus.schema>;

// ---------------------------------------------------------------------------
// Billing (subscription, not customer invoices)
// ---------------------------------------------------------------------------

export const SubscriptionStatus = enumOf([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "none",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus.schema>;

// ---------------------------------------------------------------------------
// Background work
// ---------------------------------------------------------------------------

export const JobStatus = enumOf([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof JobStatus.schema>;
