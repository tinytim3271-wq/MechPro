import { newId } from "@mechpro/shared";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Database } from "./client.js";
import { allocateNumber, CounterName } from "./counters.js";
import * as schema from "./schema/index.js";
import {
  captureDbError,
  connectTestDatabase,
  seedFixture,
  seedRepairOrder,
  truncateAll,
  type Fixture,
  type TestDatabase,
} from "./testing.js";

/** Postgres SQLSTATE codes asserted on below. */
const UNIQUE_VIOLATION = "code=23505";
const FOREIGN_KEY_VIOLATION = "code=23503";
const CHECK_VIOLATION = "code=23514";

let harness: TestDatabase;
let db: Database;
let fixture: Fixture;

beforeAll(async () => {
  harness = await connectTestDatabase();
  db = harness.db;
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await truncateAll(db);
  fixture = await seedFixture(db);
});

// ---------------------------------------------------------------------------

describe("per-organization numbering", () => {
  it("hands out distinct numbers under concurrency", async () => {
    // The original derived the next number with "max + 1", which gives
    // simultaneous callers the same value.
    const allocations = await Promise.all(
      Array.from({ length: 50 }, () =>
        allocateNumber(db, fixture.orgId, CounterName.RepairOrder),
      ),
    );

    expect(new Set(allocations).size).toBe(50);
    expect([...allocations].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("keeps counters independent per organization and per kind", async () => {
    const other = await seedFixture(db);

    await allocateNumber(db, fixture.orgId, CounterName.RepairOrder);
    const second = await allocateNumber(db, fixture.orgId, CounterName.RepairOrder);
    const otherFirst = await allocateNumber(db, other.orgId, CounterName.RepairOrder);
    const invoiceFirst = await allocateNumber(db, fixture.orgId, CounterName.Invoice);

    expect(second).toBe(2);
    expect(otherFirst).toBe(1);
    expect(invoiceFirst).toBe(1);
  });

  it("rejects a duplicate repair order number within one shop", async () => {
    await seedRepairOrder(db, fixture, { roNumber: 1 });
    const error = await captureDbError(() =>
      seedRepairOrder(db, fixture, { roNumber: 1 }),
    );
    expect(error).toContain("repair_orders_org_number_key");
    expect(error).toContain(UNIQUE_VIOLATION);
  });

  it("allows the same number in a different shop", async () => {
    const other = await seedFixture(db);
    await seedRepairOrder(db, fixture, { roNumber: 1 });
    await expect(seedRepairOrder(db, other, { roNumber: 1 })).resolves.toBeTypeOf(
      "string",
    );
  });
});

// ---------------------------------------------------------------------------

describe("inventory ledger", () => {
  async function seedPart(stockOnHand = 10): Promise<string> {
    const partId = newId();
    await db.insert(schema.parts).values({
      id: partId,
      orgId: fixture.orgId,
      name: "Brake pad set",
      partNumber: `BP-${partId.slice(0, 8)}`,
      costCents: 4_200,
      priceCents: 8_900,
      stockOnHand,
    });
    return partId;
  }

  it("refuses to consume the same repair order's parts twice", async () => {
    // This is the double-deduction bug from the original, where stock was
    // reduced once when lines were edited and again when the invoice was made.
    const partId = await seedPart();
    const repairOrderId = await seedRepairOrder(db, fixture);

    const movement = {
      orgId: fixture.orgId,
      partId,
      delta: -2,
      reason: "consumed_by_repair_order" as const,
      referenceType: "repair_order",
      referenceId: repairOrderId,
    };

    await db.insert(schema.inventoryMovements).values({ id: newId(), ...movement });

    const error = await captureDbError(() =>
      db.insert(schema.inventoryMovements).values({ id: newId(), ...movement }),
    );
    expect(error).toContain("inventory_movements_dedupe_key");
  });

  it("allows the same part to move for different repair orders", async () => {
    const partId = await seedPart();
    const firstRo = await seedRepairOrder(db, fixture, { roNumber: 1 });
    const secondRo = await seedRepairOrder(db, fixture, { roNumber: 2 });

    for (const referenceId of [firstRo, secondRo]) {
      await db.insert(schema.inventoryMovements).values({
        id: newId(),
        orgId: fixture.orgId,
        partId,
        delta: -1,
        reason: "consumed_by_repair_order",
        referenceType: "repair_order",
        referenceId,
      });
    }

    const rows = await db
      .select()
      .from(schema.inventoryMovements)
      .where(eq(schema.inventoryMovements.partId, partId));
    expect(rows).toHaveLength(2);
  });

  it("allows repeated manual adjustments, which carry no reference", async () => {
    const partId = await seedPart();
    for (let i = 0; i < 3; i += 1) {
      await db.insert(schema.inventoryMovements).values({
        id: newId(),
        orgId: fixture.orgId,
        partId,
        delta: 1,
        reason: "manual_adjustment",
      });
    }
    const rows = await db
      .select()
      .from(schema.inventoryMovements)
      .where(eq(schema.inventoryMovements.partId, partId));
    expect(rows).toHaveLength(3);
  });

  it("rejects a zero-quantity movement", async () => {
    const partId = await seedPart();
    const error = await captureDbError(() =>
      db.insert(schema.inventoryMovements).values({
        id: newId(),
        orgId: fixture.orgId,
        partId,
        delta: 0,
        reason: "manual_adjustment",
      }),
    );
    expect(error).toContain("inventory_movements_delta_nonzero");
    expect(error).toContain(CHECK_VIOLATION);
  });

  it("refuses to drive stock negative", async () => {
    const partId = await seedPart(1);
    const error = await captureDbError(() =>
      db.update(schema.parts).set({ stockOnHand: -1 }).where(eq(schema.parts.id, partId)),
    );
    expect(error).toContain("parts_stock_non_negative");
  });

  it("keeps the counter and the ledger in agreement", async () => {
    const partId = await seedPart(10);
    const repairOrderId = await seedRepairOrder(db, fixture);

    await db.transaction(async (tx) => {
      await tx.insert(schema.inventoryMovements).values({
        id: newId(),
        orgId: fixture.orgId,
        partId,
        delta: -3,
        reason: "consumed_by_repair_order",
        referenceType: "repair_order",
        referenceId: repairOrderId,
      });
      await tx
        .update(schema.parts)
        .set({ stockOnHand: sql`${schema.parts.stockOnHand} - 3` })
        .where(eq(schema.parts.id, partId));
    });

    const [part] = await db
      .select()
      .from(schema.parts)
      .where(eq(schema.parts.id, partId));
    const ledger = await db.execute<{ total: number }>(sql`
      select coalesce(sum(delta), 0) as total
      from inventory_movements where part_id = ${partId}
    `);

    expect(part?.stockOnHand).toBe(7);
    // Opening stock of 10 plus a ledger total of -3.
    expect(10 + Number(ledger.rows[0]?.total)).toBe(part?.stockOnHand);
  });
});

// ---------------------------------------------------------------------------

describe("invoices", () => {
  async function seedInvoice(
    overrides: Partial<typeof schema.invoices.$inferInsert> = {},
  ): Promise<string> {
    const id = overrides.id ?? newId();
    await db.insert(schema.invoices).values({
      id,
      orgId: fixture.orgId,
      invoiceNumber: overrides.invoiceNumber ?? 1,
      customerId: fixture.customerId,
      totalCents: 100_00,
      ...overrides,
    });
    return id;
  }

  it("derives the balance from the total and amount paid", async () => {
    const id = await seedInvoice({ totalCents: 100_00, amountPaidCents: 30_00 });
    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id));

    expect(invoice?.balanceCents).toBe(70_00);
  });

  it("keeps the balance correct after a payment updates the total paid", async () => {
    const id = await seedInvoice({ totalCents: 250_00 });
    await db
      .update(schema.invoices)
      .set({ amountPaidCents: 250_00 })
      .where(eq(schema.invoices.id, id));

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id));
    expect(invoice?.balanceCents).toBe(0);
  });

  it("rejects paying more than the invoice total", async () => {
    const id = await seedInvoice({ totalCents: 100_00 });
    const error = await captureDbError(() =>
      db
        .update(schema.invoices)
        .set({ amountPaidCents: 100_01 })
        .where(eq(schema.invoices.id, id)),
    );
    expect(error).toContain("invoices_no_overpayment");
  });

  it("allows at most one invoice per repair order", async () => {
    const repairOrderId = await seedRepairOrder(db, fixture);
    await seedInvoice({ invoiceNumber: 1, repairOrderId });
    const error = await captureDbError(() =>
      seedInvoice({ invoiceNumber: 2, repairOrderId }),
    );
    expect(error).toContain("invoices_repair_order_key");
  });

  it("makes a replayed Stripe webhook a no-op instead of a double payment", async () => {
    const invoiceId = await seedInvoice();
    const paymentIntentId = "pi_test_123";

    await db.insert(schema.invoicePayments).values({
      id: newId(),
      orgId: fixture.orgId,
      invoiceId,
      method: "card",
      amountCents: 50_00,
      stripePaymentIntentId: paymentIntentId,
    });

    const error = await captureDbError(() =>
      db.insert(schema.invoicePayments).values({
        id: newId(),
        orgId: fixture.orgId,
        invoiceId,
        method: "card",
        amountCents: 50_00,
        stripePaymentIntentId: paymentIntentId,
      }),
    );
    expect(error).toContain("invoice_payments_stripe_intent_key");
  });

  it("still allows several cash payments, which have no intent id", async () => {
    const invoiceId = await seedInvoice();
    for (const amount of [20_00, 30_00]) {
      await db.insert(schema.invoicePayments).values({
        id: newId(),
        orgId: fixture.orgId,
        invoiceId,
        method: "cash",
        amountCents: amount,
      });
    }
    const rows = await db
      .select()
      .from(schema.invoicePayments)
      .where(eq(schema.invoicePayments.invoiceId, invoiceId));
    expect(rows).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------

describe("technician pay", () => {
  it("cannot pay the same labor twice", async () => {
    const repairOrderId = await seedRepairOrder(db, fixture);
    const record = {
      orgId: fixture.orgId,
      memberId: fixture.memberId,
      repairOrderId,
      laborHoursHundredths: 250,
      laborBilledCents: 312_50,
      payCents: 156_25,
    };

    await db.insert(schema.technicianPayRecords).values({ id: newId(), ...record });
    const error = await captureDbError(() =>
      db.insert(schema.technicianPayRecords).values({ id: newId(), ...record }),
    );
    expect(error).toContain("tech_pay_ro_member_key");
  });
});

// ---------------------------------------------------------------------------

describe("time clock", () => {
  it("permits only one open shift per member", async () => {
    await db.insert(schema.timeEntries).values({
      id: newId(),
      orgId: fixture.orgId,
      memberId: fixture.memberId,
      clockInAt: new Date(),
    });

    const error = await captureDbError(() =>
      db.insert(schema.timeEntries).values({
        id: newId(),
        orgId: fixture.orgId,
        memberId: fixture.memberId,
        clockInAt: new Date(),
      }),
    );
    expect(error).toContain("time_entries_one_open_per_member");
  });

  it("permits a new shift once the previous one is closed", async () => {
    const first = newId();
    await db.insert(schema.timeEntries).values({
      id: first,
      orgId: fixture.orgId,
      memberId: fixture.memberId,
      clockInAt: new Date(Date.now() - 3_600_000),
    });
    await db
      .update(schema.timeEntries)
      .set({ clockOutAt: new Date(), totalMinutes: 60 })
      .where(eq(schema.timeEntries.id, first));

    await expect(
      db.insert(schema.timeEntries).values({
        id: newId(),
        orgId: fixture.orgId,
        memberId: fixture.memberId,
        clockInAt: new Date(),
      }),
    ).resolves.toBeDefined();
  });

  it("rejects a shift that ends before it starts", async () => {
    const now = Date.now();
    const error = await captureDbError(() =>
      db.insert(schema.timeEntries).values({
        id: newId(),
        orgId: fixture.orgId,
        memberId: fixture.memberId,
        clockInAt: new Date(now),
        clockOutAt: new Date(now - 60_000),
      }),
    );
    expect(error).toContain("time_entries_interval");
  });
});

// ---------------------------------------------------------------------------

describe("money storage", () => {
  it("round-trips large amounts exactly", async () => {
    // 12,345,678.90 in cents. A double would already be lossy in aggregate.
    const amount = 1_234_567_890;
    const id = newId();
    await db.insert(schema.invoices).values({
      id,
      orgId: fixture.orgId,
      invoiceNumber: 99,
      customerId: fixture.customerId,
      totalCents: amount,
    });

    const [invoice] = await db
      .select()
      .from(schema.invoices)
      .where(eq(schema.invoices.id, id));
    expect(invoice?.totalCents).toBe(amount);
    expect(typeof invoice?.totalCents).toBe("number");
  });

  it("sums line items without drift", async () => {
    const repairOrderId = await seedRepairOrder(db, fixture);
    // 1,000 lines at $19.99 is exactly $19,990.00.
    await db.insert(schema.repairOrderPartLines).values(
      Array.from({ length: 1_000 }, (_, index) => ({
        id: newId(),
        repairOrderId,
        description: `Part ${index}`,
        quantity: 1,
        unitPriceCents: 1_999,
        amountCents: 1_999,
        sortOrder: index,
      })),
    );

    const result = await db.execute<{ total: number }>(sql`
      select sum(amount_cents) as total
      from repair_order_part_lines where repair_order_id = ${repairOrderId}
    `);
    expect(Number(result.rows[0]?.total)).toBe(1_999_000);
  });
});

// ---------------------------------------------------------------------------

describe("tenant isolation and referential integrity", () => {
  it("removes a shop's records when the shop is deleted", async () => {
    await seedRepairOrder(db, fixture);
    // The owner's back-pointer must be cleared first; it is intentionally
    // `restrict` so a shop cannot be orphaned by accident.
    await db
      .update(schema.users)
      .set({ currentOrgId: null, currentLocationId: null })
      .where(eq(schema.users.id, fixture.userId));
    await db
      .delete(schema.organizations)
      .where(eq(schema.organizations.id, fixture.orgId));

    const remaining = await db
      .select()
      .from(schema.repairOrders)
      .where(eq(schema.repairOrders.orgId, fixture.orgId));
    expect(remaining).toHaveLength(0);
  });

  it("refuses to delete a user who still owns a shop", async () => {
    const error = await captureDbError(() =>
      db.delete(schema.users).where(eq(schema.users.id, fixture.userId)),
    );
    expect(error).toContain(FOREIGN_KEY_VIOLATION);
  });

  it("refuses to delete a customer with repair order history", async () => {
    await seedRepairOrder(db, fixture);
    const error = await captureDbError(() =>
      db.delete(schema.customers).where(eq(schema.customers.id, fixture.customerId)),
    );
    expect(error).toContain(FOREIGN_KEY_VIOLATION);
  });

  it("keeps one member row per user per shop", async () => {
    const error = await captureDbError(() =>
      db.insert(schema.orgMembers).values({
        id: newId(),
        orgId: fixture.orgId,
        userId: fixture.userId,
        role: "admin",
      }),
    );
    expect(error).toContain("org_members_org_user_key");
  });

  it("allows several unclaimed invites, which have no user yet", async () => {
    for (const email of ["a@example.test", "b@example.test"]) {
      await db.insert(schema.orgMembers).values({
        id: newId(),
        orgId: fixture.orgId,
        inviteEmail: email,
        role: "mechanic",
      });
    }
    const rows = await db
      .select()
      .from(schema.orgMembers)
      .where(eq(schema.orgMembers.orgId, fixture.orgId));
    expect(rows).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------

describe("background job outbox", () => {
  it("rolls back a queued job when its transaction fails", async () => {
    // The point of the outbox: a job can never fire for work that did not
    // commit, because enqueueing is part of the same transaction.
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(schema.outboxJobs).values({
          id: newId(),
          orgId: fixture.orgId,
          kind: "send_invoice_email",
          payload: { invoiceId: newId() },
        });
        throw new Error("business rule failed");
      }),
    ).rejects.toThrow("business rule failed");

    const jobs = await db.select().from(schema.outboxJobs);
    expect(jobs).toHaveLength(0);
  });

  it("deduplicates by idempotency key", async () => {
    const key = "invoice-email:abc";
    await db.insert(schema.outboxJobs).values({
      id: newId(),
      orgId: fixture.orgId,
      kind: "send_invoice_email",
      payload: {},
      idempotencyKey: key,
    });

    const error = await captureDbError(() =>
      db.insert(schema.outboxJobs).values({
        id: newId(),
        orgId: fixture.orgId,
        kind: "send_invoice_email",
        payload: {},
        idempotencyKey: key,
      }),
    );
    expect(error).toContain("outbox_jobs_idempotency_key");
  });
});
