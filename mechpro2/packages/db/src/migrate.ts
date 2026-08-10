import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

import { sql } from "drizzle-orm";
import { migrate as drizzleMigrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase, type Database } from "./client.js";

const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);

/**
 * Extensions the schema depends on. These must exist before the generated
 * migration runs, because the customer and part search indexes reference
 * `gin_trgm_ops`.
 */
const REQUIRED_EXTENSIONS = ["pg_trgm"] as const;

export async function ensureExtensions(db: Database): Promise<void> {
  for (const extension of REQUIRED_EXTENSIONS) {
    await db.execute(
      sql.raw(`create extension if not exists "${extension}"`),
    );
  }
}

export async function runMigrations(db: Database): Promise<void> {
  await ensureExtensions(db);
  await drizzleMigrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

/** CLI entry point: `pnpm --filter @mechpro/db migrate`. */
async function main(): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const { db, pool } = createDatabase({
    connectionString,
    maxConnections: 1,
    ssl: process.env["DATABASE_SSL"] === "true",
    // Index creation on a large table can take a while.
    statementTimeoutMs: 300_000,
  });

  try {
    await runMigrations(db);
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
const invokedDirectly =
  entrypoint !== undefined &&
  import.meta.url === pathToFileURL(entrypoint).href;

if (invokedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
