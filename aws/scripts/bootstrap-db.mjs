/**
 * Apply schema.sql to DATABASE_URL (Aurora or local Postgres).
 * Usage: DATABASE_URL=postgres://... node scripts/bootstrap-db.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "db", "schema.sql");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("Set DATABASE_URL before running db:bootstrap");
  process.exit(1);
}

const sql = readFileSync(schemaPath, "utf8");
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();
  await client.query(sql);
  console.log("Schema applied successfully.");
} catch (err) {
  console.error("Schema bootstrap failed:", err);
  process.exit(1);
} finally {
  await client.end();
}
