import { newId } from "@mechpro/shared";
import { sql } from "drizzle-orm";
import type pg from "pg";

import { createDatabase, type Database } from "./client.js";
import { runMigrations } from "./migrate.js";
import * as schema from "./schema/index.js";

export const TEST_DATABASE_URL =
  process.env["TEST_DATABASE_URL"] ??
  process.env["DATABASE_URL"] ??
  "postgres://mechpro:mechpro@localhost:5433/mechpro2";

export interface TestDatabase {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export async function connectTestDatabase(): Promise<TestDatabase> {
  const { db, pool } = createDatabase({
    connectionString: TEST_DATABASE_URL,
    maxConnections: 8,
    statementTimeoutMs: 30_000,
  });
  await runMigrations(db);
  return { db, pool, close: () => pool.end() };
}

/** Empty every application table, leaving the schema in place. */
export async function truncateAll(db: Database): Promise<void> {
  const result = await db.execute<{ tablename: string }>(sql`
    select tablename from pg_tables where schemaname = 'public'
  `);
  const tables = result.rows
    .map((row) => `"public"."${row.tablename}"`)
    .join(", ");
  if (tables.length === 0) return;
  await db.execute(
    sql.raw(`truncate table ${tables} restart identity cascade`),
  );
}

/**
 * Flatten an error and everything it wraps into one searchable string.
 *
 * Drizzle reports failures as "Failed query: ..." and keeps the driver error —
 * which is where the violated constraint name lives — on `cause`. Asserting on
 * the top-level message alone would pass for any failure at all.
 */
export function describeDbError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    const driverError = current as Error & {
      constraint?: string;
      code?: string;
      detail?: string;
    };
    parts.push(current.message);
    if (driverError.constraint) parts.push(driverError.constraint);
    if (driverError.code) parts.push(`code=${driverError.code}`);
    if (driverError.detail) parts.push(driverError.detail);
    current = current.cause;
  }

  return parts.join(" | ");
}

/**
 * Run an operation expected to fail and return a description of the failure.
 * Throws if the operation unexpectedly succeeds.
 */
export async function captureDbError(
  operation: () => Promise<unknown>,
): Promise<string> {
  try {
    await operation();
  } catch (error) {
    return describeDbError(error);
  }
  throw new Error("Expected the database to reject this operation.");
}

export interface Fixture {
  userId: string;
  orgId: string;
  locationId: string;
  memberId: string;
  customerId: string;
  vehicleId: string;
}

/** Minimal set of related rows most tests need. */
export async function seedFixture(db: Database): Promise<Fixture> {
  const userId = newId();
  const orgId = newId();
  const locationId = newId();
  const memberId = newId();
  const customerId = newId();
  const vehicleId = newId();

  await db.insert(schema.users).values({
    id: userId,
    cognitoSub: `sub-${userId}`,
    email: `owner-${userId}@example.test`,
    name: "Test Owner",
  });

  await db.insert(schema.organizations).values({
    id: orgId,
    name: "Test Auto",
    ownerId: userId,
    taxRateBps: 825,
    laborRateCents: 12_500,
  });

  await db
    .update(schema.users)
    .set({ currentOrgId: orgId })
    .where(sql`${schema.users.id} = ${userId}`);

  await db.insert(schema.locations).values({
    id: locationId,
    orgId,
    name: "Main Shop",
  });

  await db.insert(schema.orgMembers).values({
    id: memberId,
    orgId,
    userId,
    role: "owner",
    inviteStatus: "accepted",
    employmentType: "w2",
  });

  await db.insert(schema.customers).values({
    id: customerId,
    orgId,
    firstName: "Dale",
    lastName: "Earnhardt",
    phone: "5555550143",
  });

  await db.insert(schema.vehicles).values({
    id: vehicleId,
    orgId,
    customerId,
    year: 2018,
    make: "Chevrolet",
    model: "Silverado",
    vin: `1GCUKREC${userId.slice(0, 9).toUpperCase()}`,
  });

  return { userId, orgId, locationId, memberId, customerId, vehicleId };
}

/** Insert a repair order with sensible defaults. */
export async function seedRepairOrder(
  db: Database,
  fixture: Fixture,
  overrides: Partial<typeof schema.repairOrders.$inferInsert> = {},
): Promise<string> {
  const id = overrides.id ?? newId();
  await db.insert(schema.repairOrders).values({
    id,
    orgId: fixture.orgId,
    locationId: fixture.locationId,
    roNumber: overrides.roNumber ?? 1,
    customerId: fixture.customerId,
    vehicleId: fixture.vehicleId,
    complaint: "Brake noise",
    ...overrides,
  });
  return id;
}
