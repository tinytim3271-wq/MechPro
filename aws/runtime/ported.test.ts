/**
 * End-to-end test of *unmodified* convex/ code running on the AWS runtime.
 *
 * The tests above this one exercise the runtime with synthetic modules. This
 * one loads the real bundle -- all 253 functions from convex/ -- and drives
 * convex/estimates.ts, chosen because it carries the approval-token logic added
 * during the security audit. If the tokenised public estimate flow behaves
 * identically here, the compatibility approach holds for the rest of the port.
 *
 * Requires `node build.mjs` to have been run.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import pg from "pg";
import { S3Client } from "@aws-sdk/client-s3";
// Everything comes from the bundle: it inlines the runtime and therefore owns
// the registry that the 253 functions registered into.
import { Runtime, generateId, internal } from "../dist/registry.js";

const CONNECTION =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:devpw@localhost:55433/mechpro";

const ISSUER = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test";
const STAFF_SUB = "staff-1";
const STAFF_TOKEN = "staff-token";
const OUTSIDER_TOKEN = "outsider-token";
const CUSTOMER_TOKEN = "customer-token";

let pool: pg.Pool;
let runtime: Runtime;
let orgId: string;
let roId: string;
let invoiceId: string;

before(async () => {
  pool = new pg.Pool({ connectionString: CONNECTION });
  runtime = new Runtime({
    pool,
    verifyToken: async (token) => {
      if (token === STAFF_TOKEN) return { iss: ISSUER, sub: STAFF_SUB, email: "staff@shop.com" };
      if (token === OUTSIDER_TOKEN) return { iss: ISSUER, sub: "outsider-1", email: "e@evil.com" };
      if (token === CUSTOMER_TOKEN) return { iss: ISSUER, sub: "customer-1", email: "jane@example.com" };
      return null;
    },
    storage: { bucket: "test-bucket", client: new S3Client({ region: "us-east-1" }) },
  });

  const client = await pool.connect();
  try {
    await client.query(`
      DO $$
      DECLARE t text;
      BEGIN
        FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public'
        LOOP EXECUTE format('TRUNCATE TABLE %I CASCADE', t); END LOOP;
      END $$;
    `);

    const userId = generateId();
    const memberId = generateId();
    const customerId = generateId();
    const vehicleId = generateId();
    orgId = generateId();
    roId = generateId();
    invoiceId = generateId();
    const now = Date.now();

    await client.query("BEGIN");
    await client.query("SET CONSTRAINTS ALL DEFERRED");
    await client.query(
      `INSERT INTO "users" ("_id","_creationTime","tokenIdentifier","currentOrgId","email")
       VALUES ($1,$2,$3,$4,$5)`,
      [userId, now, `${ISSUER}|${STAFF_SUB}`, orgId, "staff@shop.com"],
    );
    await client.query(
      `INSERT INTO "organizations"
         ("_id","_creationTime","name","ownerId","taxRate","laborRate","bayCount","bayNames","isActive","phone")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [orgId, now, "Test Shop", userId, 8.25, 120, 1, JSON.stringify(["Bay 1"]), true, "5125550000"],
    );
    await client.query(
      `INSERT INTO "orgMembers" ("_id","_creationTime","orgId","userId","role","isActive")
       VALUES ($1,$2,$3,$4,'owner',true)`,
      [memberId, now, orgId, userId],
    );
    await client.query(
      `INSERT INTO "customers" ("_id","_creationTime","orgId","name","phone","email")
       VALUES ($1,$2,$3,'Jane Doe','5125551234','jane@example.com')`,
      [customerId, now, orgId],
    );
    await client.query(
      `INSERT INTO "vehicles" ("_id","_creationTime","orgId","customerId","year","make","model")
       VALUES ($1,$2,$3,$4,'2019','Toyota','Camry')`,
      [vehicleId, now, orgId, customerId],
    );
    await client.query(
      `INSERT INTO "repairOrders"
         ("_id","_creationTime","orgId","roNumber","customerId","vehicleId","isMobile","status",
          "priority","complaint","laborLines","partLines","shopFees","subtotal","taxAmount","totalAmount")
       VALUES ($1,$2,$3,'RO-0001',$4,$5,false,'estimate','normal','Brake noise',
               $6,'[]','[]',240,19.8,259.8)`,
      [
        roId, now, orgId, customerId, vehicleId,
        JSON.stringify([{ description: "Front brakes", laborHours: 2, laborRate: 120 }]),
      ],
    );
    await client.query(
      `INSERT INTO "invoices"
        ("_id","_creationTime","orgId","invoiceNumber","roId","customerId","status",
         "issuedAt","subtotal","taxAmount","total","amountPaid","payments")
       VALUES ($1,$2,$3,'INV-0001',$4,$5,'sent','2026-08-24T00:00:00.000Z',240,19.8,259.8,0,'[]')`,
      [invoiceId, now, orgId, roId, customerId],
     );
     await client.query(
      `INSERT INTO "_idIndex" ("_id","tableName") VALUES
         ($1,'users'),($2,'organizations'),($3,'orgMembers'),
        ($4,'customers'),($5,'vehicles'),($6,'repairOrders'),($7,'invoices')`,
      [userId, orgId, memberId, customerId, vehicleId, roId, invoiceId],
    );
    await client.query("COMMIT");
  } finally {
    client.release();
  }
});

after(async () => {
  await pool?.end();
});

describe("ported convex/estimates.ts", () => {
  let token: string;

  it("ensureApprovalToken requires authentication", async () => {
    await assert.rejects(
      () => runtime.executeByReference(internal.estimates.ensureApprovalToken, { roId }, null),
      /Not authenticated/,
    );
  });

  it("ensureApprovalToken rejects a user from another org", async () => {
    await assert.rejects(
      () =>
        runtime.executeByReference(
          internal.estimates.ensureApprovalToken,
          { roId },
          OUTSIDER_TOKEN,
        ),
      /No active org|Repair order not found|Not a member/,
    );
  });

  it("staff can mint an approval token", async () => {
    const result = (await runtime.executeByReference(
      internal.estimates.ensureApprovalToken,
      { roId },
      STAFF_TOKEN,
    )) as { token: string };
    assert.ok(result.token);
    assert.equal(result.token.length, 48, "24 random bytes rendered as hex");
    token = result.token;
  });

  it("minting again returns the same token rather than rotating it", async () => {
    const again = (await runtime.executeByReference(
      internal.estimates.ensureApprovalToken,
      { roId },
      STAFF_TOKEN,
    )) as { token: string };
    assert.equal(again.token, token);
  });

  it("getEstimatePublic returns nothing for a wrong token", async () => {
    const result = await runtime.executeByReference(
      internal.estimates.getEstimatePublic,
      { roId, token: "0".repeat(48) },
      null,
    );
    assert.equal(result, null, "a guessed token must not expose an estimate");
  });

  it("getEstimatePublic returns nothing for an empty token", async () => {
    const result = await runtime.executeByReference(
      internal.estimates.getEstimatePublic,
      { roId, token: "" },
      null,
    );
    assert.equal(result, null);
  });

  it("getEstimatePublic returns the estimate for the correct token", async () => {
    const result = (await runtime.executeByReference(
      internal.estimates.getEstimatePublic,
      { roId, token },
      null,
    )) as Record<string, unknown> | null;

    assert.ok(result, "valid token must return the estimate");
    assert.equal(result.roNumber, "RO-0001");
    assert.equal(result.customerName, "Jane Doe");
    assert.equal(result.vehicleSummary, "2019 Toyota Camry");
    assert.equal(result.orgName, "Test Shop");
    assert.equal(result.totalAmount, 259.8);
    assert.equal(result.approvedAt, null);
    // The joined labour line proves JSONB survived the Convex -> Postgres move.
    assert.equal((result.laborLines as unknown[]).length, 1);
  });

  it("approveEstimate rejects an invalid token", async () => {
    await assert.rejects(
      () =>
        runtime.executeByReference(
          internal.estimates.approveEstimate,
          { roId, token: "0".repeat(48), customerName: "Attacker" },
          null,
        ),
      /Repair order not found/,
    );
  });

  it("approveEstimate accepts the correct token and records the signature", async () => {
    const result = (await runtime.executeByReference(
      internal.estimates.approveEstimate,
      { roId, token, customerName: "Jane Doe" },
      null,
    )) as { success: boolean };
    assert.equal(result.success, true);

    const after = (await runtime.executeByReference(
      internal.estimates.getEstimatePublic,
      { roId, token },
      null,
    )) as Record<string, unknown>;
    assert.equal(after.status, "approved");
    assert.equal(after.authorizationName, "Jane Doe");
    assert.ok(after.approvedAt, "signedAt must be recorded");
  });

  it("approveEstimate refuses to approve twice", async () => {
    await assert.rejects(
      () =>
        runtime.executeByReference(
          internal.estimates.approveEstimate,
          { roId, token, customerName: "Jane Doe" },
          null,
        ),
      /already been approved/,
    );
  });
});

describe("ported convex/portal.ts", () => {
  it("returns an invoice when the verified token email owns it", async () => {
    const result = (await runtime.executeByReference(
      internal.portal.getPortalInvoice,
      { orgId, invoiceId },
      CUSTOMER_TOKEN,
    )) as Record<string, unknown> | null;

    assert.ok(result, "verified customer token must resolve its invoice");
    assert.equal(result.invoiceNumber, "INV-0001");
    assert.equal(result.balance, 259.8);
    assert.equal(result.vehicleSummary, "2019 Toyota Camry");
  });

  it("does not return the invoice to a token with another email", async () => {
    const result = await runtime.executeByReference(
      internal.portal.getPortalInvoice,
      { orgId, invoiceId },
      OUTSIDER_TOKEN,
    );
    assert.equal(result, null);
  });
});
