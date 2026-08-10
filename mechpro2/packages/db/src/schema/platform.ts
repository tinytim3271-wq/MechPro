import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { auditColumns, jobStatusEnum, primaryId, ts } from "./_shared.js";
import { orgMembers, organizations, users } from "./tenancy.js";

/**
 * Per-organization counters for human-facing sequential numbers.
 *
 * The original derived the next RO number by reading the highest existing one,
 * which hands two simultaneous writers the same number. Allocating with
 * `UPDATE ... RETURNING` takes a row lock, so concurrent callers serialize and
 * each gets a distinct value.
 */
export const counters = pgTable(
  "counters",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** "repair_order", "invoice", "purchase_order". */
    name: text("name").notNull(),
    value: integer("value").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.orgId, table.name] })],
);

/**
 * S3 object metadata, replacing Convex `_storage`.
 *
 * Rows are written before the upload completes so an abandoned upload can be
 * garbage-collected; `uploadedAt` distinguishes the two states.
 */
export const files = pgTable(
  "files",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    s3Bucket: text("s3_bucket").notNull(),
    s3Key: text("s3_key").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    checksumSha256: text("checksum_sha256"),

    /** "ro_photo", "inspection_item", "signature", "logo", "recommendation". */
    purpose: text("purpose").notNull(),
    originalFilename: text("original_filename"),

    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    uploadedAt: ts("uploaded_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("files_bucket_key_key").on(table.s3Bucket, table.s3Key),
    index("files_org_idx").on(table.orgId, table.purpose),
    index("files_pending_idx")
      .on(table.createdAt)
      .where(sql`uploaded_at is null`),
  ],
);

export const deviceSessions = pgTable(
  "device_sessions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /** Only a hash of the device token is stored. */
    deviceTokenHash: text("device_token_hash").notNull(),
    label: text("label"),
    userAgent: text("user_agent"),
    lastSeenAt: ts("last_seen_at")
      .notNull()
      .default(sql`now()`),
    revokedAt: ts("revoked_at"),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("device_sessions_token_key").on(table.deviceTokenHash),
    index("device_sessions_user_idx").on(table.userId, table.lastSeenAt),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: primaryId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),

    /** Standard Web Push subscription fields (self-hosted VAPID). */
    endpoint: text("endpoint").notNull(),
    p256dhKey: text("p256dh_key").notNull(),
    authKey: text("auth_key").notNull(),
    userAgent: text("user_agent"),

    lastUsedAt: ts("last_used_at"),
    failureCount: integer("failure_count").notNull().default(0),
    ...auditColumns(),
  },
  (table) => [
    uniqueIndex("push_subscriptions_endpoint_key").on(table.endpoint),
    index("push_subscriptions_user_idx").on(table.userId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: primaryId(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    recipientMemberId: uuid("recipient_member_id")
      .notNull()
      .references(() => orgMembers.id, { onDelete: "cascade" }),

    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    linkPath: text("link_path"),
    metadata: jsonb("metadata"),

    readAt: ts("read_at"),
    ...auditColumns(),
  },
  (table) => [
    index("notifications_recipient_idx").on(
      table.recipientMemberId,
      table.createdAt,
    ),
    index("notifications_unread_idx")
      .on(table.recipientMemberId)
      .where(sql`read_at is null`),
  ],
);

/**
 * Transactional outbox, replacing Convex's scheduler.
 *
 * Enqueueing a job is an insert inside the caller's transaction, so a job can
 * never fire for work that rolled back — and conversely, committed work always
 * has its follow-up queued. A worker claims rows with `FOR UPDATE SKIP LOCKED`.
 */
export const outboxJobs = pgTable(
  "outbox_jobs",
  {
    id: primaryId(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),

    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),

    status: jobStatusEnum("status").notNull().default("pending"),
    runAt: ts("run_at")
      .notNull()
      .default(sql`now()`),

    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),

    lockedAt: ts("locked_at"),
    lockedBy: text("locked_by"),
    completedAt: ts("completed_at"),

    /** Optional caller-supplied key that makes enqueueing idempotent. */
    idempotencyKey: text("idempotency_key"),
    ...auditColumns(),
  },
  (table) => [
    index("outbox_jobs_claim_idx")
      .on(table.runAt)
      .where(sql`status = 'pending'`),
    uniqueIndex("outbox_jobs_idempotency_key").on(table.idempotencyKey),
    index("outbox_jobs_org_idx").on(table.orgId, table.createdAt),
    check("outbox_jobs_attempts", sql`attempts >= 0 and attempts <= max_attempts`),
  ],
);

/**
 * Append-only audit trail for security-relevant and money-moving actions.
 * The original had none, so there was no way to answer "who voided this
 * invoice" or "when did this member gain admin access".
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: primaryId(),
    orgId: uuid("org_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),

    before: jsonb("before"),
    after: jsonb("after"),

    ipHash: text("ip_hash"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at")
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("audit_log_org_idx").on(table.orgId, table.createdAt),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_actor_idx").on(table.actorUserId, table.createdAt),
  ],
);

/**
 * Fixed-window rate limiting for public endpoints (booking form, estimate
 * approval, payment links), which the original left completely unthrottled.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    /** e.g. "booking:<orgId>:<ipHash>". */
    key: text("key").primaryKey(),
    windowStart: ts("window_start").notNull(),
    count: integer("count").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
  },
  (table) => [index("rate_limits_expiry_idx").on(table.expiresAt)],
);

export const filesRelations = relations(files, ({ one }) => ({
  org: one(organizations, {
    fields: [files.orgId],
    references: [organizations.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(orgMembers, {
    fields: [notifications.recipientMemberId],
    references: [orgMembers.id],
  }),
}));
