/**
 * Schema metadata for the Convex-compat runtime.
 *
 * Both JSON files are generated from a live Postgres instance by
 * aws/db/introspect.sql and aws/db/introspect-indexes.sql, so this can never
 * drift from aws/db/schema.sql. Regenerate them whenever the DDL changes.
 */
import columnsJson from "../db/schema.json" with { type: "json" };
import indexesJson from "../db/indexes.json" with { type: "json" };

type ColumnMeta = { type: string; nullable: boolean };
type TableMeta = Record<string, ColumnMeta>;

const COLUMNS = columnsJson as unknown as Record<string, TableMeta>;
const INDEX_COLUMNS = indexesJson as unknown as Record<string, string[]>;

export const TABLE_NAMES = Object.keys(COLUMNS);

/**
 * Identifiers are interpolated into SQL rather than parameterized, because
 * Postgres does not allow table or column names as bind parameters. Everything
 * that reaches the SQL string must therefore be checked against the real
 * schema first -- these two functions are the only sanctioned path.
 */
export function assertTable(table: string): string {
  if (!Object.prototype.hasOwnProperty.call(COLUMNS, table)) {
    throw new Error(`Unknown table: ${table}`);
  }
  return table;
}

export function assertColumn(table: string, column: string): string {
  const meta = COLUMNS[assertTable(table)];
  if (!Object.prototype.hasOwnProperty.call(meta, column)) {
    throw new Error(`Unknown column ${table}.${column}`);
  }
  return column;
}

/** Quote an identifier that has already been validated against the schema. */
export function quoteIdent(ident: string): string {
  return `"${ident.replace(/"/g, '""')}"`;
}

export function columnsOf(table: string): string[] {
  return Object.keys(COLUMNS[assertTable(table)]);
}

export function columnType(table: string, column: string): string {
  return COLUMNS[assertTable(table)][assertColumn(table, column)].type;
}

export function isJsonColumn(table: string, column: string): boolean {
  return columnType(table, column) === "jsonb";
}

/**
 * Ordered columns backing a Convex index. Convex index names are unqualified
 * ("by_org_status"); on Postgres they are prefixed with the table to keep them
 * globally unique.
 */
export function indexColumns(table: string, indexName: string): string[] {
  assertTable(table);
  const cols = INDEX_COLUMNS[`${table}_${indexName}`];
  if (!cols) {
    throw new Error(`Unknown index ${indexName} on ${table}`);
  }
  return cols;
}

export function hasIndex(table: string, indexName: string): boolean {
  return Boolean(INDEX_COLUMNS[`${table}_${indexName}`]);
}

/**
 * Convex omits optional fields that were never set, so `doc.foo` is
 * `undefined`. Postgres returns an explicit NULL for the same column. Stripping
 * nulls keeps `=== undefined` checks in the ported functions behaving as they
 * did on Convex.
 *
 * Also normalizes bigint columns, which node-postgres returns as strings.
 */
export function decodeRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown> | null | undefined,
): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value === null) continue;
    if (columnType(table, key) === "bigint" && typeof value === "string") {
      out[key] = Number(value);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Prepare a JS value for a bind parameter. JSONB columns need serializing;
 * everything else passes through and lets node-postgres handle the encoding.
 */
export function encodeValue(table: string, column: string, value: unknown): unknown {
  if (value === undefined) return null;
  if (value !== null && isJsonColumn(table, column)) return JSON.stringify(value);
  return value;
}
