-- MechPro — PostgreSQL schema (Aurora Serverless v2)
-- Translated 1:1 from convex/schema.ts so the Convex-compat runtime can map
-- table and field names directly with no translation table.
--
-- Conventions carried over from Convex:
--   * "_id"           opaque text primary key. Existing Convex IDs are preserved
--                     verbatim on import so no foreign key remapping is needed.
--   * "_creationTime" epoch milliseconds. Convex orders by this implicitly and
--                     uses it as the tiebreaker on every index, so it is appended
--                     to each index below to reproduce that ordering exactly.
--   * Identifiers stay camelCase and are always quoted.
--   * Convex arrays/objects become JSONB.
--   * Convex literal unions become CHECK constraints.
--
-- Foreign keys are declared NOT VALID friendly: they are created at the end of
-- the file so table creation order does not matter during a bulk restore.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── System: file storage (replaces Convex _storage / ctx.storage) ───────────
-- Rows describe objects living in the S3 files bucket.
CREATE TABLE IF NOT EXISTS "_storage" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "bucket"        TEXT NOT NULL,
  "key"           TEXT NOT NULL,
  "contentType"   TEXT,
  "size"          BIGINT,
  "sha256"        TEXT
);

CREATE TABLE IF NOT EXISTS "_storageDeletions" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "bucket"        TEXT NOT NULL,
  "key"           TEXT NOT NULL,
  "scheduledFor"  DOUBLE PRECISION NOT NULL,
  "state"         TEXT NOT NULL DEFAULT 'pending'
                  CHECK ("state" IN ('pending','inProgress','failed')),
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  "leaseExpiresAt" DOUBLE PRECISION
);
ALTER TABLE "_storageDeletions" ADD COLUMN IF NOT EXISTS "leaseExpiresAt" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "_storageDeletions_due"
  ON "_storageDeletions" ("state", "scheduledFor");

-- ─── System: id → table resolution ───────────────────────────────────────────
-- Convex IDs are opaque and carry their table internally, so ctx.db.get(id)
-- works without naming a table. Postgres cannot dispatch on a value, so every
-- row's table is recorded here. The runtime caches this in memory; new IDs are
-- also table-prefixed so most lookups never touch this table.
CREATE TABLE IF NOT EXISTS "_idIndex" (
  "_id"       TEXT PRIMARY KEY,
  "tableName" TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "_idIndex_by_table" ON "_idIndex" ("tableName");

-- ─── System: scheduler (replaces ctx.scheduler / runAfter) ───────────────────
-- EventBridge Scheduler triggers the runner; this table is the durable queue
-- and audit trail so a scheduled call is never silently lost.
CREATE TABLE IF NOT EXISTS "_scheduledFunctions" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "functionPath"  TEXT NOT NULL,
  "args"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "scheduledFor"  DOUBLE PRECISION NOT NULL,
  "state"         TEXT NOT NULL DEFAULT 'pending'
                  CHECK ("state" IN ('pending','inProgress','success','failed','canceled')),
  "attempts"      INTEGER NOT NULL DEFAULT 0,
  "lastError"     TEXT,
  "completedAt"   DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS "_scheduledFunctions_due"
  ON "_scheduledFunctions" ("state", "scheduledFor");

-- ─── Multi-tenant orgs ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "organizations" (
  "_id"                    TEXT PRIMARY KEY,
  "_creationTime"          DOUBLE PRECISION NOT NULL,
  "name"                   TEXT NOT NULL,
  "ownerId"                TEXT NOT NULL,
  "phone"                  TEXT,
  "email"                  TEXT,
  "address"                TEXT,
  "city"                   TEXT,
  "state"                  TEXT,
  "zip"                    TEXT,
  "logoUrl"                TEXT,
  "taxRate"                DOUBLE PRECISION NOT NULL,
  "laborRate"              DOUBLE PRECISION NOT NULL,
  "bayCount"               DOUBLE PRECISION NOT NULL,
  "bayNames"               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "isActive"               BOOLEAN NOT NULL,
  "smsEnabled"             BOOLEAN,
  "smsAutoOnComplete"      BOOLEAN,
  "smsAutoOnStart"         BOOLEAN,
  "twilioAccountSid"       TEXT,
  "twilioAuthToken"        TEXT,
  "twilioPhoneNumber"      TEXT,
  "smsTemplateStart"       TEXT,
  "smsTemplateComplete"    TEXT,
  "carfaxEnabled"          BOOLEAN,
  "carfaxPartnerKey"       TEXT,
  "carfaxLocationId"       TEXT,
  "shopSupplyFeeEnabled"   BOOLEAN,
  "shopSupplyFeePercent"   DOUBLE PRECISION,
  "shopSupplyFeeCap"       DOUBLE PRECISION,
  "hazmatFeeEnabled"       BOOLEAN,
  "hazmatFeePercent"       DOUBLE PRECISION,
  "hazmatFeeCap"           DOUBLE PRECISION,
  "aiExternalProcessingEnabled" BOOLEAN,
  "aiConsentUpdatedAt"     TEXT,
  "aiConsentUpdatedBy"     TEXT,
  "aiAuditRetentionDays"   DOUBLE PRECISION
);
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "aiExternalProcessingEnabled" BOOLEAN;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "aiConsentUpdatedAt" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "aiConsentUpdatedBy" TEXT;
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "aiAuditRetentionDays" DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "organizations_by_owner"
  ON "organizations" ("ownerId", "_creationTime");

CREATE TABLE IF NOT EXISTS "pendingImageUploads" (
  "_id"          TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "claimToken"   TEXT NOT NULL,
  "orgId"        TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "kind"         TEXT NOT NULL CHECK ("kind" IN ('ro_photo','inspection_photo','recommendation_photo')),
  "contentType"  TEXT NOT NULL,
  "size"         DOUBLE PRECISION NOT NULL,
  "createdAt"    TEXT NOT NULL,
  "storageId"    TEXT,
  "expiresAt"    DOUBLE PRECISION NOT NULL
);
ALTER TABLE "pendingImageUploads" ADD COLUMN IF NOT EXISTS "storageId" TEXT;
ALTER TABLE "pendingImageUploads" ADD COLUMN IF NOT EXISTS "expiresAt" DOUBLE PRECISION;
UPDATE "pendingImageUploads"
  SET "expiresAt" = "_creationTime" + (20 * 60 * 1000)
  WHERE "expiresAt" IS NULL;
ALTER TABLE "pendingImageUploads" ALTER COLUMN "expiresAt" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "pendingImageUploads_by_claim_token"
  ON "pendingImageUploads" ("claimToken", "_creationTime");

-- ─── Users / staff ───────────────────────────────────────────────────────────
-- "tokenIdentifier" holds the OIDC subject. During the Hercules→Cognito cutover
-- this is re-mapped; see aws/db/migrate/ for the identity mapping step.
CREATE TABLE IF NOT EXISTS "users" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "tokenIdentifier"     TEXT NOT NULL,
  "name"                TEXT,
  "email"               TEXT,
  "phone"               TEXT,
  "avatarUrl"           TEXT,
  "currentOrgId"        TEXT,
  "currentLocationId"   TEXT,
  "commerceCustomerId"  TEXT,
  "activeDeviceSession" TEXT,
  "freeAccessUntil"     TEXT,
  "role"                TEXT,
  "isActive"            BOOLEAN
);
CREATE INDEX IF NOT EXISTS "users_by_token"
  ON "users" ("tokenIdentifier", "_creationTime");
CREATE INDEX IF NOT EXISTS "users_by_email"
  ON "users" ("email", "_creationTime");

-- ─── Org membership ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "orgMembers" (
  "_id"             TEXT PRIMARY KEY,
  "_creationTime"   DOUBLE PRECISION NOT NULL,
  "orgId"           TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "role"            TEXT NOT NULL
                    CHECK ("role" IN ('owner','admin','service_writer','mechanic','mobile_mechanic')),
  "isActive"        BOOLEAN NOT NULL,
  "locationId"      TEXT,
  "hasAdminAccess"  BOOLEAN,
  "inviteEmail"     TEXT,
  "inviteStatus"    TEXT CHECK ("inviteStatus" IN ('pending','accepted','declined')),
  "employmentType"  TEXT CHECK ("employmentType" IN ('w2','1099'))
);
CREATE INDEX IF NOT EXISTS "orgMembers_by_org"
  ON "orgMembers" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "orgMembers_by_user"
  ON "orgMembers" ("userId", "_creationTime");
CREATE INDEX IF NOT EXISTS "orgMembers_by_org_user"
  ON "orgMembers" ("orgId", "userId", "_creationTime");
CREATE INDEX IF NOT EXISTS "orgMembers_by_invite_email"
  ON "orgMembers" ("inviteEmail", "_creationTime");

-- ─── Shop locations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "locations" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "address"       TEXT,
  "city"          TEXT,
  "state"         TEXT,
  "zip"           TEXT,
  "phone"         TEXT,
  "bayCount"      DOUBLE PRECISION NOT NULL,
  "bayNames"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "isActive"      BOOLEAN NOT NULL,
  "sortOrder"     DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "locations_by_org"
  ON "locations" ("orgId", "_creationTime");

-- ─── Payroll deductions & advances ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payrollDeductions" (
  "_id"             TEXT PRIMARY KEY,
  "_creationTime"   DOUBLE PRECISION NOT NULL,
  "orgId"           TEXT NOT NULL,
  "memberId"        TEXT NOT NULL,
  "type"            TEXT NOT NULL CHECK ("type" IN ('advance','uniform','tools','other')),
  "description"     TEXT NOT NULL,
  "totalAmount"     DOUBLE PRECISION NOT NULL,
  "amountPerCheck"  DOUBLE PRECISION,
  "amountApplied"   DOUBLE PRECISION NOT NULL,
  "status"          TEXT NOT NULL CHECK ("status" IN ('active','paid_off','cancelled')),
  "createdAt"       TEXT NOT NULL,
  "notes"           TEXT
);
CREATE INDEX IF NOT EXISTS "payrollDeductions_by_org"
  ON "payrollDeductions" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payrollDeductions_by_member"
  ON "payrollDeductions" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payrollDeductions_by_member_status"
  ON "payrollDeductions" ("memberId", "status", "_creationTime");

-- ─── Deduction payments (ledger) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deductionPayments" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "deductionId"   TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "amount"        DOUBLE PRECISION NOT NULL,
  "appliedAt"     TEXT NOT NULL,
  "note"          TEXT
);
CREATE INDEX IF NOT EXISTS "deductionPayments_by_deduction"
  ON "deductionPayments" ("deductionId", "_creationTime");
CREATE INDEX IF NOT EXISTS "deductionPayments_by_member"
  ON "deductionPayments" ("memberId", "_creationTime");

-- ─── Tech pay records ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "techPayRecords" (
  "_id"             TEXT PRIMARY KEY,
  "_creationTime"   DOUBLE PRECISION NOT NULL,
  "orgId"           TEXT NOT NULL,
  "memberId"        TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "roId"            TEXT NOT NULL,
  "invoiceId"       TEXT NOT NULL,
  "roNumber"        TEXT NOT NULL,
  "customerName"    TEXT NOT NULL,
  "vehicleSummary"  TEXT NOT NULL,
  "laborLines"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalHours"      DOUBLE PRECISION NOT NULL,
  "totalEarned"     DOUBLE PRECISION NOT NULL,
  "paidAt"          TEXT NOT NULL,
  "employmentType"  TEXT CHECK ("employmentType" IN ('w2','1099'))
);
CREATE INDEX IF NOT EXISTS "techPayRecords_by_org"
  ON "techPayRecords" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "techPayRecords_by_member"
  ON "techPayRecords" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "techPayRecords_by_member_paidAt"
  ON "techPayRecords" ("memberId", "paidAt", "_creationTime");
CREATE INDEX IF NOT EXISTS "techPayRecords_by_org_paidAt"
  ON "techPayRecords" ("orgId", "paidAt", "_creationTime");
CREATE INDEX IF NOT EXISTS "techPayRecords_by_ro"
  ON "techPayRecords" ("roId", "_creationTime");

-- ─── Customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "customers" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "phone"         TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "city"          TEXT,
  "state"         TEXT,
  "zip"           TEXT,
  "notes"         TEXT,
  "source"        TEXT,
  "lastVisit"     TEXT,
  "smsOptOut"     BOOLEAN
);
CREATE INDEX IF NOT EXISTS "customers_by_org"
  ON "customers" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "customers_by_org_name"
  ON "customers" ("orgId", "name", "_creationTime");
-- Replaces Convex .searchIndex("search_email", filterFields: ["orgId"]).
CREATE INDEX IF NOT EXISTS "customers_search_email"
  ON "customers" USING GIN ("email" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "customers_search_email_org"
  ON "customers" ("orgId", lower("email"));

-- ─── Vehicles ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vehicles" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "customerId"    TEXT NOT NULL,
  "year"          TEXT NOT NULL,
  "make"          TEXT NOT NULL,
  "model"         TEXT NOT NULL,
  "trim"          TEXT,
  "vin"           TEXT,
  "licensePlate"  TEXT,
  "color"         TEXT,
  "mileageIn"     DOUBLE PRECISION,
  "engine"        TEXT,
  "transmission"  TEXT,
  "notes"         TEXT
);
CREATE INDEX IF NOT EXISTS "vehicles_by_org"
  ON "vehicles" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "vehicles_by_customer"
  ON "vehicles" ("customerId", "_creationTime");
CREATE INDEX IF NOT EXISTS "vehicles_by_vin"
  ON "vehicles" ("vin", "_creationTime");

-- ─── Repair orders ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "repairOrders" (
  "_id"                     TEXT PRIMARY KEY,
  "_creationTime"           DOUBLE PRECISION NOT NULL,
  "orgId"                   TEXT NOT NULL,
  "locationId"              TEXT,
  "roNumber"                TEXT NOT NULL,
  "customerId"              TEXT NOT NULL,
  "vehicleId"               TEXT NOT NULL,
  "assignedTo"              TEXT,
  "bayName"                 TEXT,
  "isMobile"                BOOLEAN NOT NULL,
  "mobileAddress"           TEXT,
  "serviceAddress"          TEXT,
  "serviceCity"             TEXT,
  "serviceState"            TEXT,
  "serviceZip"              TEXT,
  "serviceLat"              DOUBLE PRECISION,
  "serviceLng"              DOUBLE PRECISION,
  "status"                  TEXT NOT NULL
                            CHECK ("status" IN ('estimate','approved','in_progress','waiting_parts','completed','invoiced','cancelled')),
  "priority"                TEXT NOT NULL CHECK ("priority" IN ('low','normal','high')),
  "complaint"               TEXT NOT NULL,
  "cause"                   TEXT,
  "correction"              TEXT,
  "mileageIn"               DOUBLE PRECISION,
  "mileageOut"              DOUBLE PRECISION,
  "scheduledAt"             TEXT,
  "startedAt"               TEXT,
  "completedAt"             TEXT,
  "promisedAt"              TEXT,
  "laborLines"              JSONB NOT NULL DEFAULT '[]'::jsonb,
  "partLines"               JSONB NOT NULL DEFAULT '[]'::jsonb,
  "shopFees"                JSONB NOT NULL DEFAULT '[]'::jsonb,
  "subtotal"                DOUBLE PRECISION NOT NULL,
  "taxAmount"               DOUBLE PRECISION NOT NULL,
  "totalAmount"             DOUBLE PRECISION NOT NULL,
  "internalNotes"           TEXT,
  "authorizationName"       TEXT,
  "authorizationMethod"     TEXT,
  "customerSignature"       TEXT,
  "signedAt"                TEXT,
  -- Secret token gating the public /approve page. Never expose in list queries.
  "approvalToken"           TEXT,
  "carfaxReportedAt"        TEXT,
  "techLocationStatus"      TEXT CHECK ("techLocationStatus" IN ('en_route','on_site','left_site')),
  "techLocationUpdatedAt"   TEXT,
  "diagnosticChecklist"     JSONB,
  "repairChecklist"         JSONB,
  "probableCauses"          JSONB,
  "recommendedServices"     JSONB,
  "aiWorkflowStatus"        TEXT CHECK ("aiWorkflowStatus" IN ('pending','generating','completed','failed')),
  "aiAmbiguityFlag"         TEXT
);
CREATE INDEX IF NOT EXISTS "repairOrders_by_org"
  ON "repairOrders" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "repairOrders_by_org_status"
  ON "repairOrders" ("orgId", "status", "_creationTime");
CREATE INDEX IF NOT EXISTS "repairOrders_by_customer"
  ON "repairOrders" ("customerId", "_creationTime");
CREATE INDEX IF NOT EXISTS "repairOrders_by_vehicle"
  ON "repairOrders" ("vehicleId", "_creationTime");
CREATE INDEX IF NOT EXISTS "repairOrders_by_roNumber"
  ON "repairOrders" ("roNumber", "_creationTime");
-- Public approve page looks up strictly by token; keep it fast and unique-ish.
CREATE INDEX IF NOT EXISTS "repairOrders_by_approvalToken"
  ON "repairOrders" ("approvalToken") WHERE "approvalToken" IS NOT NULL;

-- ─── Invoices ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "invoices" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "orgId"               TEXT NOT NULL,
  "locationId"          TEXT,
  "roId"                TEXT NOT NULL,
  "customerId"          TEXT NOT NULL,
  "invoiceNumber"       TEXT NOT NULL,
  "status"              TEXT NOT NULL CHECK ("status" IN ('draft','sent','partial','paid','void')),
  "issuedAt"            TEXT NOT NULL,
  "dueAt"               TEXT,
  "subtotal"            DOUBLE PRECISION NOT NULL,
  "taxAmount"           DOUBLE PRECISION NOT NULL,
  "total"               DOUBLE PRECISION NOT NULL,
  "amountPaid"          DOUBLE PRECISION NOT NULL,
  "payments"            JSONB NOT NULL DEFAULT '[]'::jsonb,
  "notes"               TEXT,
  "remindersEnabled"    BOOLEAN,
  "lastReminderSentAt"  TEXT,
  "remindersSentCount"  DOUBLE PRECISION
);
CREATE INDEX IF NOT EXISTS "invoices_by_org"
  ON "invoices" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "invoices_by_ro"
  ON "invoices" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "invoices_by_customer"
  ON "invoices" ("customerId", "_creationTime");
CREATE INDEX IF NOT EXISTS "invoices_by_org_status"
  ON "invoices" ("orgId", "status", "_creationTime");

-- Stripe webhook event ledger. Unique event and session IDs close concurrent
-- replay races in the same transaction that credits the invoice.
CREATE TABLE IF NOT EXISTS "stripeWebhookEvents" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "eventId"             TEXT NOT NULL,
  "eventCreated"        DOUBLE PRECISION NOT NULL,
  "eventType"           TEXT NOT NULL,
  "sessionId"           TEXT NOT NULL,
  "orgId"               TEXT NOT NULL,
  "invoiceId"           TEXT NOT NULL,
  "amountCents"         DOUBLE PRECISION NOT NULL,
  "processedAt"         TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "stripeWebhookEvents_by_eventId"
  ON "stripeWebhookEvents" ("eventId");
CREATE UNIQUE INDEX IF NOT EXISTS "stripeWebhookEvents_by_sessionId"
  ON "stripeWebhookEvents" ("sessionId");

-- Signed terminal webhook failures are acknowledged only after this durable
-- reconciliation record commits. Identifiers remain text because malformed
-- invoice/shop metadata is itself evidence that must be retained.
CREATE TABLE IF NOT EXISTS "stripeWebhookRejections" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "eventId"             TEXT NOT NULL,
  "eventCreated"        DOUBLE PRECISION NOT NULL,
  "eventType"           TEXT NOT NULL,
  "sessionId"           TEXT NOT NULL,
  "orgId"               TEXT NOT NULL,
  "invoiceId"           TEXT NOT NULL,
  "amountCents"         DOUBLE PRECISION NOT NULL,
  "paymentStatus"       TEXT NOT NULL,
  "currency"            TEXT NOT NULL,
  "reason"              TEXT NOT NULL,
  "recordedAt"          TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "stripeWebhookRejections_by_eventId"
  ON "stripeWebhookRejections" ("eventId");

-- ─── Parts / inventory ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "parts" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "orgId"               TEXT NOT NULL,
  "sku"                 TEXT,
  "partNumber"          TEXT,
  "name"                TEXT NOT NULL,
  "description"         TEXT,
  "category"            TEXT,
  "stockQty"            DOUBLE PRECISION NOT NULL,
  "lowStockThreshold"   DOUBLE PRECISION NOT NULL,
  "unitCost"            DOUBLE PRECISION NOT NULL,
  "unitPrice"           DOUBLE PRECISION NOT NULL,
  "supplier"            TEXT,
  "location"            TEXT
);
CREATE INDEX IF NOT EXISTS "parts_by_org"
  ON "parts" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "parts_by_org_name"
  ON "parts" ("orgId", "name", "_creationTime");
-- Replaces Convex .searchIndex("search_name", filterFields: ["orgId"]).
CREATE INDEX IF NOT EXISTS "parts_search_name"
  ON "parts" USING GIN ("name" gin_trgm_ops);

-- ─── Labor matrix ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "laborMatrix" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "orgId"               TEXT NOT NULL,
  "serviceCategory"     TEXT NOT NULL,
  "serviceDescription"  TEXT NOT NULL,
  "flatRateHours"       DOUBLE PRECISION NOT NULL,
  "notes"               TEXT
);
CREATE INDEX IF NOT EXISTS "laborMatrix_by_org"
  ON "laborMatrix" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "laborMatrix_by_org_category"
  ON "laborMatrix" ("orgId", "serviceCategory", "_creationTime");

-- ─── GPS / location pings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "locationPings" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "lat"           DOUBLE PRECISION NOT NULL,
  "lng"           DOUBLE PRECISION NOT NULL,
  "accuracy"      DOUBLE PRECISION,
  "timestamp"     TEXT NOT NULL,
  "roId"          TEXT
);
CREATE INDEX IF NOT EXISTS "locationPings_by_org"
  ON "locationPings" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "locationPings_by_member"
  ON "locationPings" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "locationPings_by_member_timestamp"
  ON "locationPings" ("memberId", "timestamp", "_creationTime");

-- ─── Time clock entries ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "timeEntries" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "clockInAt"     TEXT NOT NULL,
  "clockOutAt"    TEXT,
  "clockInLat"    DOUBLE PRECISION,
  "clockInLng"    DOUBLE PRECISION,
  "clockOutLat"   DOUBLE PRECISION,
  "clockOutLng"   DOUBLE PRECISION,
  "totalHours"    DOUBLE PRECISION,
  "notes"         TEXT
);
CREATE INDEX IF NOT EXISTS "timeEntries_by_org"
  ON "timeEntries" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "timeEntries_by_member"
  ON "timeEntries" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "timeEntries_by_member_clockIn"
  ON "timeEntries" ("memberId", "clockInAt", "_creationTime");

-- ─── Suppliers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "suppliers" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "contactName"   TEXT,
  "phone"         TEXT,
  "email"         TEXT,
  "website"       TEXT,
  "accountNumber" TEXT,
  "notes"         TEXT,
  "isActive"      BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS "suppliers_by_org"
  ON "suppliers" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "suppliers_by_org_name"
  ON "suppliers" ("orgId", "name", "_creationTime");

-- ─── Purchase orders ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "purchaseOrders" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "poNumber"      TEXT NOT NULL,
  "supplierId"    TEXT NOT NULL,
  "status"        TEXT NOT NULL CHECK ("status" IN ('draft','sent','partial','received','cancelled')),
  "lines"         JSONB NOT NULL DEFAULT '[]'::jsonb,
  "subtotal"      DOUBLE PRECISION NOT NULL,
  "notes"         TEXT,
  "aiGenerated"   BOOLEAN,
  "aiReason"      TEXT,
  "orderedAt"     TEXT,
  "expectedAt"    TEXT,
  "receivedAt"    TEXT,
  "createdBy"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "purchaseOrders_by_org"
  ON "purchaseOrders" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "purchaseOrders_by_org_status"
  ON "purchaseOrders" ("orgId", "status", "_creationTime");
CREATE INDEX IF NOT EXISTS "purchaseOrders_by_supplier"
  ON "purchaseOrders" ("supplierId", "_creationTime");

-- ─── Import history ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "importHistory" (
  "_id"               TEXT PRIMARY KEY,
  "_creationTime"     DOUBLE PRECISION NOT NULL,
  "orgId"             TEXT NOT NULL,
  "importType"        TEXT NOT NULL CHECK ("importType" IN ('customers','vehicles','parts')),
  "fileName"          TEXT NOT NULL,
  "totalRows"         DOUBLE PRECISION NOT NULL,
  "imported"          DOUBLE PRECISION NOT NULL,
  "skipped"           DOUBLE PRECISION NOT NULL,
  "duplicates"        DOUBLE PRECISION NOT NULL,
  "noCustomerMatch"   DOUBLE PRECISION,
  "importedAt"        TEXT NOT NULL,
  "importedBy"        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "importHistory_by_org"
  ON "importHistory" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "importHistory_by_org_importedAt"
  ON "importHistory" ("orgId", "importedAt", "_creationTime");

-- ─── RO photos ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "roPhotos" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "roId"          TEXT NOT NULL,
  "storageId"     TEXT NOT NULL,
  "caption"       TEXT,
  "uploadedBy"    TEXT NOT NULL,
  "uploadedAt"    TEXT NOT NULL,
  "photoType"     TEXT CHECK ("photoType" IN ('intake','damage','during','complete'))
);
CREATE INDEX IF NOT EXISTS "roPhotos_by_ro"
  ON "roPhotos" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "roPhotos_by_org"
  ON "roPhotos" ("orgId", "_creationTime");

-- ─── Booking requests (public submit) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "bookingRequests" (
  "_id"                 TEXT PRIMARY KEY,
  "_creationTime"       DOUBLE PRECISION NOT NULL,
  "orgId"               TEXT NOT NULL,
  "customerName"        TEXT NOT NULL,
  "customerPhone"       TEXT NOT NULL,
  "customerEmail"       TEXT,
  "vehicleYear"         TEXT,
  "vehicleMake"         TEXT,
  "vehicleModel"        TEXT,
  "vehicleVin"          TEXT,
  "serviceDescription"  TEXT NOT NULL,
  "preferredDate"       TEXT NOT NULL,
  "preferredTime"       TEXT,
  "notes"               TEXT,
  "status"              TEXT NOT NULL CHECK ("status" IN ('pending','confirmed','declined','converted')),
  "staffNotes"          TEXT,
  "submittedAt"         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "bookingRequests_by_org"
  ON "bookingRequests" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "bookingRequests_by_org_status"
  ON "bookingRequests" ("orgId", "status", "_creationTime");
CREATE INDEX IF NOT EXISTS "bookingRequests_by_org_submittedAt"
  ON "bookingRequests" ("orgId", "submittedAt", "_creationTime");
-- Supports the per-phone-per-hour rate limit added in the security audit.
CREATE INDEX IF NOT EXISTS "bookingRequests_ratelimit"
  ON "bookingRequests" ("orgId", "customerPhone", "submittedAt");

-- ─── Verified image uploads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "verifiedImageUploads" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "storageId"     TEXT NOT NULL,
  "orgId"         TEXT NOT NULL,
  "userId"        TEXT NOT NULL,
  "kind"          TEXT NOT NULL CHECK ("kind" IN ('ro_photo','inspection_photo','recommendation_photo')),
  "contentType"   TEXT NOT NULL,
  "size"          DOUBLE PRECISION NOT NULL,
  "verifiedAt"    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "verifiedImageUploads_by_storage"
  ON "verifiedImageUploads" ("storageId", "_creationTime");

-- ─── External AI audit lifecycle ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "externalAiAuditEvents" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "userId"        TEXT,
  "operation"     TEXT NOT NULL,
  "createdAt"     TEXT NOT NULL,
  "expiresAt"     TEXT NOT NULL
);
ALTER TABLE "externalAiAuditEvents" ALTER COLUMN "userId" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "externalAiAuditEvents_by_org"
  ON "externalAiAuditEvents" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "externalAiAuditEvents_by_expires"
  ON "externalAiAuditEvents" ("expiresAt", "_creationTime");

-- ─── Vehicle inspections ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inspections" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "roId"          TEXT NOT NULL,
  "templateName"  TEXT NOT NULL,
  "completedBy"   TEXT,
  "completedAt"   TEXT,
  "status"        TEXT NOT NULL CHECK ("status" IN ('in_progress','completed')),
  "notes"         TEXT
);
CREATE INDEX IF NOT EXISTS "inspections_by_ro"
  ON "inspections" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "inspections_by_org"
  ON "inspections" ("orgId", "_creationTime");

CREATE TABLE IF NOT EXISTS "inspectionItems" (
  "_id"             TEXT PRIMARY KEY,
  "_creationTime"   DOUBLE PRECISION NOT NULL,
  "inspectionId"    TEXT NOT NULL,
  "orgId"           TEXT NOT NULL,
  "category"        TEXT NOT NULL,
  "itemName"        TEXT NOT NULL,
  "result"          TEXT NOT NULL CHECK ("result" IN ('ok','needs_attention','critical','na')),
  "notes"           TEXT,
  "photoStorageId"  TEXT,
  "sortOrder"       DOUBLE PRECISION NOT NULL
);
CREATE INDEX IF NOT EXISTS "inspectionItems_by_inspection"
  ON "inspectionItems" ("inspectionId", "_creationTime");
CREATE INDEX IF NOT EXISTS "inspectionItems_by_org"
  ON "inspectionItems" ("orgId", "_creationTime");

-- ─── Device sessions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "deviceSessions" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "userId"        TEXT NOT NULL,
  "sessionToken"  TEXT NOT NULL,
  "deviceName"    TEXT NOT NULL,
  "registeredAt"  TEXT NOT NULL,
  "lastActiveAt"  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "deviceSessions_by_user"
  ON "deviceSessions" ("userId", "_creationTime");
CREATE INDEX IF NOT EXISTS "deviceSessions_by_user_token"
  ON "deviceSessions" ("userId", "sessionToken", "_creationTime");

-- ─── Social / marketing posts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "socialPosts" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "platform"      TEXT NOT NULL CHECK ("platform" IN ('facebook','instagram','google','general')),
  "content"       TEXT NOT NULL,
  "status"        TEXT NOT NULL CHECK ("status" IN ('draft','scheduled','published')),
  "scheduledAt"   TEXT,
  "publishedAt"   TEXT,
  "tags"          JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdBy"     TEXT NOT NULL,
  "imageUrl"      TEXT
);
CREATE INDEX IF NOT EXISTS "socialPosts_by_org"
  ON "socialPosts" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "socialPosts_by_org_status"
  ON "socialPosts" ("orgId", "status", "_creationTime");

-- ─── RO messages ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "roMessages" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "roId"          TEXT NOT NULL,
  "senderId"      TEXT NOT NULL,
  "senderName"    TEXT NOT NULL,
  "senderRole"    TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "readByOffice"  BOOLEAN NOT NULL,
  "readByTech"    BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS "roMessages_by_ro"
  ON "roMessages" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "roMessages_by_org"
  ON "roMessages" ("orgId", "_creationTime");

-- ─── Office notifications ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "officeNotifications" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "roId"          TEXT,
  "type"          TEXT NOT NULL CHECK ("type" IN ('tech_arrived','tech_left','tech_en_route')),
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "techMemberId"  TEXT,
  "isRead"        BOOLEAN NOT NULL,
  "createdAt"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "officeNotifications_by_org"
  ON "officeNotifications" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "officeNotifications_by_org_unread"
  ON "officeNotifications" ("orgId", "isRead", "_creationTime");

-- ─── Tech notifications ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "techNotifications" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "roId"          TEXT,
  "type"          TEXT NOT NULL CHECK ("type" IN ('job_assigned','job_updated','general')),
  "title"         TEXT NOT NULL,
  "body"          TEXT NOT NULL,
  "isRead"        BOOLEAN NOT NULL,
  "createdAt"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "techNotifications_by_member"
  ON "techNotifications" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "techNotifications_by_member_unread"
  ON "techNotifications" ("memberId", "isRead", "_creationTime");

-- ─── Tech recommendations ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "techRecommendations" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "roId"          TEXT NOT NULL,
  "memberId"      TEXT NOT NULL,
  "techName"      TEXT NOT NULL,
  "title"         TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "urgency"       TEXT NOT NULL CHECK ("urgency" IN ('immediate','soon','future')),
  "photoIds"      JSONB NOT NULL DEFAULT '[]'::jsonb,
  "status"        TEXT NOT NULL CHECK ("status" IN ('pending','approved','declined')),
  "createdAt"     TEXT NOT NULL,
  "reviewedAt"    TEXT,
  "reviewedBy"    TEXT
);
CREATE INDEX IF NOT EXISTS "techRecommendations_by_ro"
  ON "techRecommendations" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "techRecommendations_by_org"
  ON "techRecommendations" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "techRecommendations_by_org_status"
  ON "techRecommendations" ("orgId", "status", "_creationTime");

-- ─── Push notification identities ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "pushIdentities" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "secret"        TEXT NOT NULL,
  "visitorId"     TEXT NOT NULL,
  -- Added for the self-hosted VAPID web-push replacement: the raw browser
  -- PushSubscription (endpoint + p256dh + auth keys) Hercules used to hold.
  "subscription"  JSONB
);
CREATE INDEX IF NOT EXISTS "pushIdentities_by_secret"
  ON "pushIdentities" ("secret", "_creationTime");
CREATE INDEX IF NOT EXISTS "pushIdentities_by_visitorId"
  ON "pushIdentities" ("visitorId", "_creationTime");

-- ─── Referential integrity ───────────────────────────────────────────────────
-- Declared after all tables exist so bulk restore order does not matter.
-- Convex enforced none of these; they are added here because the relational
-- store can, and they will catch the cross-org bugs the audit found by hand.

CREATE OR REPLACE PROCEDURE pg_temp.add_constraint(statement TEXT)
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
CALL pg_temp.add_constraint($constraint$ALTER TABLE "organizations"      ADD CONSTRAINT "organizations_ownerId_fk"        FOREIGN KEY ("ownerId")       REFERENCES "users"("_id") DEFERRABLE INITIALLY IMMEDIATE$constraint$);
-- These two close reference cycles (organizations.ownerId -> users -> organizations,
-- and users -> locations -> organizations -> users). Marked deferrable so a loader
-- can SET CONSTRAINTS ALL DEFERRED and insert the tables in any order inside one
-- transaction. They still validate immediately during normal application writes.
-- currentOrgId / currentLocationId are soft pointers ("what am I looking at
-- right now"), not ownership, so they null out rather than blocking a delete.
CALL pg_temp.add_constraint($constraint$ALTER TABLE "users"              ADD CONSTRAINT "users_currentOrgId_fk"           FOREIGN KEY ("currentOrgId")  REFERENCES "organizations"("_id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "users"              ADD CONSTRAINT "users_currentLocationId_fk"      FOREIGN KEY ("currentLocationId") REFERENCES "locations"("_id") ON DELETE SET NULL DEFERRABLE INITIALLY IMMEDIATE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "orgMembers"         ADD CONSTRAINT "orgMembers_orgId_fk"             FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "orgMembers"         ADD CONSTRAINT "orgMembers_userId_fk"            FOREIGN KEY ("userId")        REFERENCES "users"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "orgMembers"         ADD CONSTRAINT "orgMembers_locationId_fk"        FOREIGN KEY ("locationId")    REFERENCES "locations"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "locations"          ADD CONSTRAINT "locations_orgId_fk"              FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "payrollDeductions"  ADD CONSTRAINT "payrollDeductions_orgId_fk"      FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "payrollDeductions"  ADD CONSTRAINT "payrollDeductions_memberId_fk"   FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "deductionPayments"  ADD CONSTRAINT "deductionPayments_orgId_fk"      FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "deductionPayments"  ADD CONSTRAINT "deductionPayments_deductionId_fk" FOREIGN KEY ("deductionId")  REFERENCES "payrollDeductions"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "deductionPayments"  ADD CONSTRAINT "deductionPayments_memberId_fk"   FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techPayRecords"     ADD CONSTRAINT "techPayRecords_orgId_fk"         FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techPayRecords"     ADD CONSTRAINT "techPayRecords_memberId_fk"      FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techPayRecords"     ADD CONSTRAINT "techPayRecords_userId_fk"        FOREIGN KEY ("userId")        REFERENCES "users"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techPayRecords"     ADD CONSTRAINT "techPayRecords_roId_fk"          FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techPayRecords"     ADD CONSTRAINT "techPayRecords_invoiceId_fk"     FOREIGN KEY ("invoiceId")     REFERENCES "invoices"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "customers"          ADD CONSTRAINT "customers_orgId_fk"              FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "vehicles"           ADD CONSTRAINT "vehicles_orgId_fk"               FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "vehicles"           ADD CONSTRAINT "vehicles_customerId_fk"          FOREIGN KEY ("customerId")    REFERENCES "customers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "repairOrders"       ADD CONSTRAINT "repairOrders_orgId_fk"           FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "repairOrders"       ADD CONSTRAINT "repairOrders_locationId_fk"      FOREIGN KEY ("locationId")    REFERENCES "locations"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "repairOrders"       ADD CONSTRAINT "repairOrders_customerId_fk"      FOREIGN KEY ("customerId")    REFERENCES "customers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "repairOrders"       ADD CONSTRAINT "repairOrders_vehicleId_fk"       FOREIGN KEY ("vehicleId")     REFERENCES "vehicles"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "repairOrders"       ADD CONSTRAINT "repairOrders_assignedTo_fk"      FOREIGN KEY ("assignedTo")    REFERENCES "orgMembers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "invoices"           ADD CONSTRAINT "invoices_orgId_fk"               FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "invoices"           ADD CONSTRAINT "invoices_locationId_fk"          FOREIGN KEY ("locationId")    REFERENCES "locations"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "invoices"           ADD CONSTRAINT "invoices_roId_fk"                FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "invoices"           ADD CONSTRAINT "invoices_customerId_fk"          FOREIGN KEY ("customerId")    REFERENCES "customers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "stripeWebhookEvents" ADD CONSTRAINT "stripeWebhookEvents_orgId_fk"    FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "stripeWebhookEvents" ADD CONSTRAINT "stripeWebhookEvents_invoiceId_fk" FOREIGN KEY ("invoiceId")    REFERENCES "invoices"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "parts"              ADD CONSTRAINT "parts_orgId_fk"                  FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "laborMatrix"        ADD CONSTRAINT "laborMatrix_orgId_fk"            FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "locationPings"      ADD CONSTRAINT "locationPings_orgId_fk"          FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "locationPings"      ADD CONSTRAINT "locationPings_memberId_fk"       FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "locationPings"      ADD CONSTRAINT "locationPings_roId_fk"           FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "timeEntries"        ADD CONSTRAINT "timeEntries_orgId_fk"            FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "timeEntries"        ADD CONSTRAINT "timeEntries_memberId_fk"         FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "suppliers"          ADD CONSTRAINT "suppliers_orgId_fk"              FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "purchaseOrders"     ADD CONSTRAINT "purchaseOrders_orgId_fk"         FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "purchaseOrders"     ADD CONSTRAINT "purchaseOrders_supplierId_fk"    FOREIGN KEY ("supplierId")    REFERENCES "suppliers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "purchaseOrders"     ADD CONSTRAINT "purchaseOrders_createdBy_fk"     FOREIGN KEY ("createdBy")     REFERENCES "users"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "importHistory"      ADD CONSTRAINT "importHistory_orgId_fk"          FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "importHistory"      ADD CONSTRAINT "importHistory_importedBy_fk"     FOREIGN KEY ("importedBy")    REFERENCES "users"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roPhotos"           ADD CONSTRAINT "roPhotos_orgId_fk"               FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roPhotos"           ADD CONSTRAINT "roPhotos_roId_fk"                FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roPhotos"           ADD CONSTRAINT "roPhotos_storageId_fk"           FOREIGN KEY ("storageId")     REFERENCES "_storage"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roPhotos"           ADD CONSTRAINT "roPhotos_uploadedBy_fk"          FOREIGN KEY ("uploadedBy")    REFERENCES "users"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "bookingRequests"    ADD CONSTRAINT "bookingRequests_orgId_fk"        FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "verifiedImageUploads" ADD CONSTRAINT "verifiedImageUploads_storageId_fk" FOREIGN KEY ("storageId") REFERENCES "_storage"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "verifiedImageUploads" ADD CONSTRAINT "verifiedImageUploads_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "verifiedImageUploads" ADD CONSTRAINT "verifiedImageUploads_userId_fk" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "externalAiAuditEvents" ADD CONSTRAINT "externalAiAuditEvents_orgId_fk" FOREIGN KEY ("orgId") REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "externalAiAuditEvents" ADD CONSTRAINT "externalAiAuditEvents_userId_fk" FOREIGN KEY ("userId") REFERENCES "users"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspections"        ADD CONSTRAINT "inspections_orgId_fk"            FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspections"        ADD CONSTRAINT "inspections_roId_fk"             FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspections"        ADD CONSTRAINT "inspections_completedBy_fk"      FOREIGN KEY ("completedBy")   REFERENCES "orgMembers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspectionItems"    ADD CONSTRAINT "inspectionItems_inspectionId_fk" FOREIGN KEY ("inspectionId")  REFERENCES "inspections"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspectionItems"    ADD CONSTRAINT "inspectionItems_orgId_fk"        FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "inspectionItems"    ADD CONSTRAINT "inspectionItems_photoStorageId_fk" FOREIGN KEY ("photoStorageId") REFERENCES "_storage"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "deviceSessions"     ADD CONSTRAINT "deviceSessions_userId_fk"        FOREIGN KEY ("userId")        REFERENCES "users"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "socialPosts"        ADD CONSTRAINT "socialPosts_orgId_fk"            FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "socialPosts"        ADD CONSTRAINT "socialPosts_createdBy_fk"        FOREIGN KEY ("createdBy")     REFERENCES "users"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roMessages"         ADD CONSTRAINT "roMessages_orgId_fk"             FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roMessages"         ADD CONSTRAINT "roMessages_roId_fk"              FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "roMessages"         ADD CONSTRAINT "roMessages_senderId_fk"          FOREIGN KEY ("senderId")      REFERENCES "orgMembers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "officeNotifications" ADD CONSTRAINT "officeNotifications_orgId_fk"   FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "officeNotifications" ADD CONSTRAINT "officeNotifications_roId_fk"    FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "officeNotifications" ADD CONSTRAINT "officeNotifications_techMemberId_fk" FOREIGN KEY ("techMemberId") REFERENCES "orgMembers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techNotifications"  ADD CONSTRAINT "techNotifications_orgId_fk"      FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techNotifications"  ADD CONSTRAINT "techNotifications_memberId_fk"   FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techNotifications"  ADD CONSTRAINT "techNotifications_roId_fk"       FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE SET NULL$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techRecommendations" ADD CONSTRAINT "techRecommendations_orgId_fk"   FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techRecommendations" ADD CONSTRAINT "techRecommendations_roId_fk"    FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE CASCADE$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techRecommendations" ADD CONSTRAINT "techRecommendations_memberId_fk" FOREIGN KEY ("memberId")     REFERENCES "orgMembers"("_id")$constraint$);
CALL pg_temp.add_constraint($constraint$ALTER TABLE "techRecommendations" ADD CONSTRAINT "techRecommendations_reviewedBy_fk" FOREIGN KEY ("reviewedBy") REFERENCES "orgMembers"("_id")$constraint$);

COMMIT;
