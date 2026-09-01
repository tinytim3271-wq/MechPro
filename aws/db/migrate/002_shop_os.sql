-- Additive shop-OS schema for existing Aurora databases.
-- New installs should apply aws/db/schema.sql instead (it already includes these tables).

BEGIN;

ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "hourlyRate" DOUBLE PRECISION;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "annualSalary" DOUBLE PRECISION;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "hireDate" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "ssnLast4" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "taxIdLast4" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "payAddress" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "filingStatus" TEXT;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "overtimeMultiplier" DOUBLE PRECISION;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "stateTaxRate" DOUBLE PRECISION;
ALTER TABLE "orgMembers" ADD COLUMN IF NOT EXISTS "payFrequency" TEXT;

-- ─── Payroll runs & pay stubs ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "payrollRuns" (
  "_id"                  TEXT PRIMARY KEY,
  "_creationTime"        DOUBLE PRECISION NOT NULL,
  "orgId"                TEXT NOT NULL,
  "payPeriodStart"       TEXT NOT NULL,
  "payPeriodEnd"         TEXT NOT NULL,
  "checkDate"            TEXT NOT NULL,
  "createdByUserId"      TEXT NOT NULL,
  "employeesProcessed"   DOUBLE PRECISION NOT NULL,
  "totalGrossPay"        DOUBLE PRECISION NOT NULL,
  "totalNetPay"          DOUBLE PRECISION NOT NULL,
  "totalDeductions"      DOUBLE PRECISION NOT NULL,
  "status"               TEXT NOT NULL CHECK ("status" IN ('draft','finalized')),
  "notes"                TEXT
);
CREATE INDEX IF NOT EXISTS "payrollRuns_by_org"
  ON "payrollRuns" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payrollRuns_by_org_checkDate"
  ON "payrollRuns" ("orgId", "checkDate", "_creationTime");

CREATE TABLE IF NOT EXISTS "payStubs" (
  "_id"                  TEXT PRIMARY KEY,
  "_creationTime"        DOUBLE PRECISION NOT NULL,
  "orgId"                TEXT NOT NULL,
  "payrollRunId"         TEXT NOT NULL,
  "memberId"             TEXT NOT NULL,
  "employeeName"         TEXT NOT NULL,
  "employmentType"       TEXT NOT NULL CHECK ("employmentType" IN ('w2','1099')),
  "checkDate"            TEXT NOT NULL,
  "payPeriodStart"       TEXT NOT NULL,
  "payPeriodEnd"         TEXT NOT NULL,
  "regularHours"         DOUBLE PRECISION NOT NULL,
  "overtimeHours"        DOUBLE PRECISION NOT NULL,
  "regularRate"          DOUBLE PRECISION NOT NULL,
  "overtimeRate"         DOUBLE PRECISION NOT NULL,
  "regularPay"           DOUBLE PRECISION NOT NULL,
  "overtimePay"          DOUBLE PRECISION NOT NULL,
  "bonusOrOther"         DOUBLE PRECISION NOT NULL,
  "grossPay"             DOUBLE PRECISION NOT NULL,
  "federalIncomeTax"     DOUBLE PRECISION NOT NULL,
  "socialSecurityTax"    DOUBLE PRECISION NOT NULL,
  "medicareTax"          DOUBLE PRECISION NOT NULL,
  "stateIncomeTax"       DOUBLE PRECISION NOT NULL,
  "otherDeductions"      DOUBLE PRECISION NOT NULL,
  "advancesDeducted"     DOUBLE PRECISION NOT NULL,
  "advancesDetail"       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "totalDeductions"      DOUBLE PRECISION NOT NULL,
  "netPay"               DOUBLE PRECISION NOT NULL,
  "ytdGross"             DOUBLE PRECISION NOT NULL,
  "ytdDeductions"        DOUBLE PRECISION NOT NULL,
  "ytdNet"               DOUBLE PRECISION NOT NULL,
  "notes"                TEXT
);
CREATE INDEX IF NOT EXISTS "payStubs_by_org"
  ON "payStubs" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payStubs_by_run"
  ON "payStubs" ("payrollRunId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payStubs_by_member"
  ON "payStubs" ("memberId", "_creationTime");
CREATE INDEX IF NOT EXISTS "payStubs_by_member_checkDate"
  ON "payStubs" ("memberId", "checkDate", "_creationTime");

-- ─── Shop expenses ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "shopExpenses" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "date"          TEXT NOT NULL,
  "category"      TEXT NOT NULL,
  "vendorName"    TEXT NOT NULL,
  "supplierId"    TEXT,
  "amount"        DOUBLE PRECISION NOT NULL,
  "notes"         TEXT,
  "poId"          TEXT,
  "createdBy"     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "shopExpenses_by_org"
  ON "shopExpenses" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "shopExpenses_by_org_date"
  ON "shopExpenses" ("orgId", "date", "_creationTime");

-- ─── Inspection templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "inspectionTemplates" (
  "_id"           TEXT PRIMARY KEY,
  "_creationTime" DOUBLE PRECISION NOT NULL,
  "orgId"         TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "isDefault"     BOOLEAN NOT NULL,
  "items"         JSONB NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS "inspectionTemplates_by_org"
  ON "inspectionTemplates" ("orgId", "_creationTime");

-- ─── OBD diagnostic scan sessions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "diagnosticSessions" (
  "_id"              TEXT PRIMARY KEY,
  "_creationTime"    DOUBLE PRECISION NOT NULL,
  "orgId"            TEXT NOT NULL,
  "vehicleId"        TEXT NOT NULL,
  "customerId"       TEXT,
  "roId"             TEXT,
  "mode"             TEXT NOT NULL CHECK ("mode" IN ('simulator','hardware')),
  "adapterType"      TEXT NOT NULL CHECK ("adapterType" IN ('simulator','elm327','stn','j2534')),
  "adapterStatus"    TEXT NOT NULL,
  "vin"              TEXT,
  "mileage"          DOUBLE PRECISION,
  "dtcs"             JSONB NOT NULL DEFAULT '[]'::jsonb,
  "freezeFrame"      JSONB,
  "livePidSamples"   JSONB,
  "readiness"        JSONB,
  "clearedAt"        TEXT,
  "clearConfirmedBy" TEXT,
  "notes"            TEXT,
  "createdBy"        TEXT NOT NULL,
  "scannedAt"        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "diagnosticSessions_by_org"
  ON "diagnosticSessions" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "diagnosticSessions_by_vehicle"
  ON "diagnosticSessions" ("vehicleId", "_creationTime");
CREATE INDEX IF NOT EXISTS "diagnosticSessions_by_ro"
  ON "diagnosticSessions" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "diagnosticSessions_by_org_scannedAt"
  ON "diagnosticSessions" ("orgId", "scannedAt", "_creationTime");

-- ─── Authorized key programming jobs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "keyProgrammingJobs" (
  "_id"                  TEXT PRIMARY KEY,
  "_creationTime"        DOUBLE PRECISION NOT NULL,
  "orgId"                TEXT NOT NULL,
  "customerId"           TEXT NOT NULL,
  "vehicleId"            TEXT NOT NULL,
  "roId"                 TEXT NOT NULL,
  "authorizationName"    TEXT NOT NULL,
  "authorizationMethod"  TEXT,
  "signedAt"             TEXT NOT NULL,
  "keyType"              TEXT NOT NULL CHECK ("keyType" IN ('transponder','proximity','mechanical','smart_key')),
  "operation"            TEXT NOT NULL CHECK ("operation" IN ('identify','add_key','program_key','test')),
  "mode"                 TEXT NOT NULL CHECK ("mode" IN ('simulator','hardware')),
  "adapterStatus"        TEXT NOT NULL,
  "result"               TEXT NOT NULL CHECK ("result" IN ('pending','success','failed','blocked')),
  "resultNotes"          TEXT,
  "programmedAt"         TEXT,
  "createdBy"            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS "keyProgrammingJobs_by_org"
  ON "keyProgrammingJobs" ("orgId", "_creationTime");
CREATE INDEX IF NOT EXISTS "keyProgrammingJobs_by_vehicle"
  ON "keyProgrammingJobs" ("vehicleId", "_creationTime");
CREATE INDEX IF NOT EXISTS "keyProgrammingJobs_by_ro"
  ON "keyProgrammingJobs" ("roId", "_creationTime");
CREATE INDEX IF NOT EXISTS "keyProgrammingJobs_by_customer"
  ON "keyProgrammingJobs" ("customerId", "_creationTime");


DO $$ BEGIN
  ALTER TABLE "payrollRuns"        ADD CONSTRAINT "payrollRuns_orgId_fk"              FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payrollRuns"        ADD CONSTRAINT "payrollRuns_createdByUserId_fk"    FOREIGN KEY ("createdByUserId") REFERENCES "users"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payStubs"           ADD CONSTRAINT "payStubs_orgId_fk"                 FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payStubs"           ADD CONSTRAINT "payStubs_payrollRunId_fk"          FOREIGN KEY ("payrollRunId")  REFERENCES "payrollRuns"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "payStubs"           ADD CONSTRAINT "payStubs_memberId_fk"              FOREIGN KEY ("memberId")      REFERENCES "orgMembers"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shopExpenses"       ADD CONSTRAINT "shopExpenses_orgId_fk"             FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shopExpenses"       ADD CONSTRAINT "shopExpenses_supplierId_fk"        FOREIGN KEY ("supplierId")    REFERENCES "suppliers"("_id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shopExpenses"       ADD CONSTRAINT "shopExpenses_poId_fk"              FOREIGN KEY ("poId")          REFERENCES "purchaseOrders"("_id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "shopExpenses"       ADD CONSTRAINT "shopExpenses_createdBy_fk"         FOREIGN KEY ("createdBy")     REFERENCES "users"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "inspectionTemplates" ADD CONSTRAINT "inspectionTemplates_orgId_fk"     FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "diagnosticSessions" ADD CONSTRAINT "diagnosticSessions_orgId_fk"       FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "diagnosticSessions" ADD CONSTRAINT "diagnosticSessions_vehicleId_fk"   FOREIGN KEY ("vehicleId")     REFERENCES "vehicles"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "diagnosticSessions" ADD CONSTRAINT "diagnosticSessions_customerId_fk"  FOREIGN KEY ("customerId")    REFERENCES "customers"("_id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "diagnosticSessions" ADD CONSTRAINT "diagnosticSessions_roId_fk"        FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "diagnosticSessions" ADD CONSTRAINT "diagnosticSessions_createdBy_fk"   FOREIGN KEY ("createdBy")     REFERENCES "users"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "keyProgrammingJobs" ADD CONSTRAINT "keyProgrammingJobs_orgId_fk"       FOREIGN KEY ("orgId")         REFERENCES "organizations"("_id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "keyProgrammingJobs" ADD CONSTRAINT "keyProgrammingJobs_customerId_fk"  FOREIGN KEY ("customerId")    REFERENCES "customers"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "keyProgrammingJobs" ADD CONSTRAINT "keyProgrammingJobs_vehicleId_fk"   FOREIGN KEY ("vehicleId")     REFERENCES "vehicles"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "keyProgrammingJobs" ADD CONSTRAINT "keyProgrammingJobs_roId_fk"        FOREIGN KEY ("roId")          REFERENCES "repairOrders"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "keyProgrammingJobs" ADD CONSTRAINT "keyProgrammingJobs_createdBy_fk"   FOREIGN KEY ("createdBy")     REFERENCES "users"("_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMIT;
