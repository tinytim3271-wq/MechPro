-- Smoke test for schema.sql.
-- Proves the org <-> user reference cycle can be loaded, that CHECK constraints
-- reject bad enum values, and that the trigram search index is usable.

\set ON_ERROR_STOP on

-- 1. Circular reference load (organizations.ownerId <-> users.currentOrgId).
BEGIN;
SET CONSTRAINTS ALL DEFERRED;
INSERT INTO "users" ("_id", "_creationTime", "tokenIdentifier", "currentOrgId", "email")
VALUES ('u1', 1700000000000, 'https://auth.example.com|sub-1', 'o1', 'owner@example.com');
INSERT INTO "organizations"
  ("_id", "_creationTime", "name", "ownerId", "taxRate", "laborRate", "bayCount", "bayNames", "isActive")
VALUES ('o1', 1700000000000, 'Test Shop', 'u1', 8.25, 120, 3, '["Bay 1","Bay 2","Bay 3"]', true);
COMMIT;
SELECT 'PASS: circular org/user insert' AS result;

-- 2. Normal (non-deferred) inserts still work for the rest of the graph.
INSERT INTO "orgMembers" ("_id", "_creationTime", "orgId", "userId", "role", "isActive")
VALUES ('m1', 1700000000001, 'o1', 'u1', 'owner', true);
INSERT INTO "customers" ("_id", "_creationTime", "orgId", "name", "phone", "email")
VALUES ('c1', 1700000000002, 'o1', 'Jane Doe', '5125551234', 'jane@example.com');
INSERT INTO "vehicles" ("_id", "_creationTime", "orgId", "customerId", "year", "make", "model")
VALUES ('v1', 1700000000003, 'o1', 'c1', '2019', 'Toyota', 'Camry');
INSERT INTO "repairOrders"
  ("_id", "_creationTime", "orgId", "roNumber", "customerId", "vehicleId", "isMobile",
   "status", "priority", "complaint", "laborLines", "partLines", "shopFees",
   "subtotal", "taxAmount", "totalAmount", "approvalToken")
VALUES ('r1', 1700000000004, 'o1', 'RO-0001', 'c1', 'v1', false,
        'estimate', 'normal', 'Brake noise',
        '[{"description":"Front brakes","laborHours":2,"laborRate":120}]',
        '[{"description":"Pads","quantity":1,"unitCost":40,"unitPrice":80}]',
        '[]', 320, 26.40, 346.40, 'a1b2c3d4e5f6');
SELECT 'PASS: relational graph insert' AS result;

-- 3. CHECK constraints reject invalid enum values.
DO $$
BEGIN
  BEGIN
    INSERT INTO "repairOrders"
      ("_id", "_creationTime", "orgId", "roNumber", "customerId", "vehicleId", "isMobile",
       "status", "priority", "complaint", "laborLines", "partLines", "shopFees",
       "subtotal", "taxAmount", "totalAmount")
    VALUES ('r-bad', 1700000000005, 'o1', 'RO-BAD', 'c1', 'v1', false,
            'not_a_real_status', 'normal', 'x', '[]', '[]', '[]', 0, 0, 0);
    RAISE EXCEPTION 'FAIL: invalid status was accepted';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PASS: invalid status rejected by CHECK';
  END;
END $$;

-- 4. Cross-org foreign keys are enforced (the IDOR class the audit fixed by hand).
DO $$
BEGIN
  BEGIN
    INSERT INTO "invoices"
      ("_id", "_creationTime", "orgId", "roId", "customerId", "invoiceNumber",
       "status", "issuedAt", "subtotal", "taxAmount", "total", "amountPaid", "payments")
    VALUES ('i-bad', 1700000000006, 'o-nonexistent', 'r1', 'c1', 'INV-BAD',
            'draft', '2026-01-01T00:00:00Z', 0, 0, 0, 0, '[]');
    RAISE EXCEPTION 'FAIL: invoice for nonexistent org was accepted';
  EXCEPTION WHEN foreign_key_violation THEN
    RAISE NOTICE 'PASS: dangling orgId rejected by FK';
  END;
END $$;

-- 5. JSONB round-trips and is queryable.
SELECT CASE
  WHEN ("laborLines" -> 0 ->> 'laborHours')::numeric = 2 THEN 'PASS: JSONB round-trip'
  ELSE 'FAIL: JSONB round-trip'
END AS result
FROM "repairOrders" WHERE "_id" = 'r1';

-- 6. Trigram search index replaces Convex searchIndex("search_email").
SELECT CASE
  WHEN count(*) = 1 THEN 'PASS: trigram email search'
  ELSE 'FAIL: trigram email search'
END AS result
FROM "customers"
WHERE "orgId" = 'o1' AND "email" ILIKE '%jane%';

-- 7. Partial index on approvalToken supports the tokenized public estimate page.
SELECT CASE
  WHEN count(*) = 1 THEN 'PASS: approvalToken lookup'
  ELSE 'FAIL: approvalToken lookup'
END AS result
FROM "repairOrders" WHERE "approvalToken" = 'a1b2c3d4e5f6';

-- 8. ON DELETE CASCADE unwinds a tenant cleanly.
DELETE FROM "organizations" WHERE "_id" = 'o1';
SELECT CASE
  WHEN (SELECT count(*) FROM "repairOrders") = 0
   AND (SELECT count(*) FROM "customers") = 0
   AND (SELECT count(*) FROM "orgMembers") = 0
  THEN 'PASS: tenant cascade delete'
  ELSE 'FAIL: tenant cascade delete'
END AS result;
