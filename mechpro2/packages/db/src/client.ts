import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema/index.js";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * `bigint` columns arrive from `pg` as strings to avoid precision loss. Every
 * bigint here is a money amount in cents, comfortably inside the safe integer
 * range, so parsing them to numbers keeps call sites free of string math.
 */
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));

/** `numeric` likewise, for the few aggregate results that come back numeric. */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

export interface DatabaseConfig {
  connectionString: string;
  /** Lambda keeps one warm connection; a long-lived worker can hold more. */
  maxConnections?: number;
  ssl?: boolean;
  statementTimeoutMs?: number;
}

let pool: pg.Pool | undefined;
let database: Database | undefined;

export function createPool(config: DatabaseConfig): pg.Pool {
  return new pg.Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 1,
    ssl: config.ssl ? { rejectUnauthorized: true } : undefined,
    // Keep sockets short-lived enough that a failed-over database endpoint is
    // picked up without recycling the whole execution environment.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: config.statementTimeoutMs ?? 20_000,
    application_name: "mechpro2",
  });
}

/**
 * Module-scoped so a warm Lambda reuses the connection rather than paying TCP
 * and TLS setup on every request.
 */
export function getDatabase(config?: DatabaseConfig): Database {
  if (database) return database;

  const connectionString =
    config?.connectionString ?? process.env["DATABASE_URL"];
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  pool = createPool({ ...config, connectionString });
  database = drizzle(pool, { schema, casing: "snake_case" });
  return database;
}

/** Build an isolated database handle, for tests and one-off scripts. */
export function createDatabase(config: DatabaseConfig): {
  db: Database;
  pool: pg.Pool;
} {
  const isolatedPool = createPool(config);
  return {
    db: drizzle(isolatedPool, { schema, casing: "snake_case" }),
    pool: isolatedPool,
  };
}

export async function closeDatabase(): Promise<void> {
  await pool?.end();
  pool = undefined;
  database = undefined;
}

export { schema };
