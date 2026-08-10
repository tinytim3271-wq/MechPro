import { sql } from "drizzle-orm";

import type { Database, Transaction } from "./client.js";

export const CounterName = {
  RepairOrder: "repair_order",
  Invoice: "invoice",
  PurchaseOrder: "purchase_order",
} as const;

export type CounterName = (typeof CounterName)[keyof typeof CounterName];

/**
 * Allocate the next sequential number for an organization.
 *
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` is a single atomic
 * statement: the row is locked for the duration, so two concurrent callers
 * serialize and receive different values. Contrast the original, which read the
 * highest existing number and added one — under any concurrency at all, two
 * repair orders could be handed the same number, and the unique index would
 * then reject one of them.
 *
 * Must be called inside the same transaction as the insert that consumes the
 * number, so a rollback does not burn a value.
 */
export async function allocateNumber(
  db: Database | Transaction,
  orgId: string,
  name: CounterName,
): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`
    insert into counters (org_id, name, value)
    values (${orgId}, ${name}, 1)
    on conflict (org_id, name)
      do update set value = counters.value + 1
    returning value
  `);

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Failed to allocate ${name} number for org ${orgId}`);
  }
  return Number(row.value);
}

/** Read the current value without consuming one. */
export async function peekCounter(
  db: Database | Transaction,
  orgId: string,
  name: CounterName,
): Promise<number> {
  const result = await db.execute<{ value: number }>(sql`
    select value from counters where org_id = ${orgId} and name = ${name}
  `);
  return Number(result.rows[0]?.value ?? 0);
}
