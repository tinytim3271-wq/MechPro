/**
 * Convex `ctx.db` implemented over PostgreSQL.
 *
 * The goal is behavioural fidelity, not a general ORM: the ported Convex
 * functions in convex/ must keep working without edits. Only the surface the
 * codebase actually uses is implemented (profiled from convex/): get, insert,
 * patch, delete, query, withIndex, withSearchIndex, filter, order, take, first,
 * unique, collect, paginate.
 *
 * Fidelity notes:
 *  - Convex orders by the index's fields in declaration order with
 *    _creationTime as the final tiebreaker. indexColumns() supplies that from
 *    the real Postgres index, so ORDER BY matches Convex exactly.
 *  - Absent optional fields read back as `undefined`, not `null` (see
 *    decodeRow), so existing `?? ` and `=== undefined` checks behave the same.
 *  - `unique()` throws when more than one row matches, as Convex does.
 */
import type { PoolClient } from "pg";
import {
  assertColumn,
  assertTable,
  columnsOf,
  decodeRow,
  encodeValue,
  hasIndex,
  indexColumns,
  quoteIdent,
} from "./schema.ts";

export type Doc = Record<string, unknown> & { _id: string; _creationTime: number };
type Order = "asc" | "desc";

// ─── ID generation ───────────────────────────────────────────────────────────

const ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Opaque, collision-resistant document ID. Convex IDs are also opaque strings,
 * and existing ones are preserved verbatim during migration, so both formats
 * coexist and resolve through _idIndex.
 */
export function generateId(): string {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return out;
}

// ─── Expression trees ────────────────────────────────────────────────────────

type FieldRef = { __field: string };
type Expr =
  | { kind: "cmp"; op: string; field: string; value: unknown }
  | { kind: "and"; parts: Expr[] }
  | { kind: "or"; parts: Expr[] }
  | { kind: "not"; part: Expr };

const isFieldRef = (v: unknown): v is FieldRef =>
  typeof v === "object" && v !== null && "__field" in (v as object);

/** Mirrors Convex's `q` argument to `.filter()`. */
class FilterBuilder {
  field(name: string): FieldRef {
    return { __field: name };
  }
  private cmp(op: string, a: unknown, b: unknown): Expr {
    // Convex always writes q.eq(q.field("x"), value); tolerate the reverse too.
    if (isFieldRef(a)) return { kind: "cmp", op, field: a.__field, value: b };
    if (isFieldRef(b)) return { kind: "cmp", op, field: b.__field, value: a };
    throw new Error("filter comparison requires q.field(...) on one side");
  }
  eq(a: unknown, b: unknown): Expr { return this.cmp("=", a, b); }
  neq(a: unknown, b: unknown): Expr { return this.cmp("<>", a, b); }
  lt(a: unknown, b: unknown): Expr { return this.cmp("<", a, b); }
  lte(a: unknown, b: unknown): Expr { return this.cmp("<=", a, b); }
  gt(a: unknown, b: unknown): Expr { return this.cmp(">", a, b); }
  gte(a: unknown, b: unknown): Expr { return this.cmp(">=", a, b); }
  and(...parts: Expr[]): Expr { return { kind: "and", parts }; }
  or(...parts: Expr[]): Expr { return { kind: "or", parts }; }
  not(part: Expr): Expr { return { kind: "not", part }; }
}

/** Mirrors Convex's `q` argument to `.withIndex()`. */
class IndexRangeBuilder {
  readonly clauses: { op: string; field: string; value: unknown }[] = [];
  private push(op: string, field: string, value: unknown) {
    this.clauses.push({ op, field, value });
    return this;
  }
  eq(field: string, value: unknown) { return this.push("=", field, value); }
  gt(field: string, value: unknown) { return this.push(">", field, value); }
  gte(field: string, value: unknown) { return this.push(">=", field, value); }
  lt(field: string, value: unknown) { return this.push("<", field, value); }
  lte(field: string, value: unknown) { return this.push("<=", field, value); }
}

/** Mirrors Convex's `q` argument to `.withSearchIndex()`. */
class SearchFilterBuilder {
  searchField?: string;
  searchValue?: string;
  readonly eqs: { field: string; value: unknown }[] = [];
  search(field: string, value: string) {
    this.searchField = field;
    this.searchValue = value;
    return this;
  }
  eq(field: string, value: unknown) {
    this.eqs.push({ field, value });
    return this;
  }
}

// ─── SQL builder ─────────────────────────────────────────────────────────────

class SqlParams {
  readonly values: unknown[] = [];
  bind(value: unknown): string {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

function compileExpr(table: string, expr: Expr, p: SqlParams): string {
  switch (expr.kind) {
    case "and":
      if (expr.parts.length === 0) return "TRUE";
      return `(${expr.parts.map((e) => compileExpr(table, e, p)).join(" AND ")})`;
    case "or":
      if (expr.parts.length === 0) return "FALSE";
      return `(${expr.parts.map((e) => compileExpr(table, e, p)).join(" OR ")})`;
    case "not":
      return `(NOT ${compileExpr(table, expr.part, p)})`;
    case "cmp": {
      const col = quoteIdent(assertColumn(table, expr.field));
      if (expr.value === undefined || expr.value === null) {
        // Convex treats an absent field and an explicit null as equal.
        return expr.op === "=" ? `${col} IS NULL` : `${col} IS NOT NULL`;
      }
      return `${col} ${expr.op} ${p.bind(encodeValue(table, expr.field, expr.value))}`;
    }
  }
}

// ─── Query builder ───────────────────────────────────────────────────────────

export class QueryBuilder {
  private indexName?: string;
  private indexClauses: { op: string; field: string; value: unknown }[] = [];
  private searchSpec?: SearchFilterBuilder;
  private filters: Expr[] = [];
  private direction: Order = "asc";

  private readonly client: PoolClient;
  private readonly table: string;

  constructor(client: PoolClient, table: string) {
    assertTable(table);
    this.client = client;
    this.table = table;
  }

  withIndex(indexName: string, fn?: (q: IndexRangeBuilder) => IndexRangeBuilder): this {
    if (!hasIndex(this.table, indexName)) {
      throw new Error(`Unknown index ${indexName} on ${this.table}`);
    }
    this.indexName = indexName;
    if (fn) {
      const b = new IndexRangeBuilder();
      fn(b);
      this.indexClauses = b.clauses;
    }
    return this;
  }

  withSearchIndex(indexName: string, fn: (q: SearchFilterBuilder) => SearchFilterBuilder): this {
    const b = new SearchFilterBuilder();
    fn(b);
    this.searchSpec = b;
    this.indexName = indexName;
    return this;
  }

  filter(fn: (q: FilterBuilder) => Expr): this {
    this.filters.push(fn(new FilterBuilder()));
    return this;
  }

  order(dir: Order): this {
    this.direction = dir;
    return this;
  }

  /** Builds the statement shared by every terminal operator. */
  private build(limit?: number, after?: { creationTime: number; id: string }) {
    const p = new SqlParams();
    const where: string[] = [];

    for (const c of this.indexClauses) {
      const col = quoteIdent(assertColumn(this.table, c.field));
      if (c.value === undefined || c.value === null) {
        where.push(c.op === "=" ? `${col} IS NULL` : `${col} IS NOT NULL`);
      } else {
        where.push(`${col} ${c.op} ${p.bind(encodeValue(this.table, c.field, c.value))}`);
      }
    }

    if (this.searchSpec) {
      const { searchField, searchValue, eqs } = this.searchSpec;
      if (searchField && searchValue) {
        const col = quoteIdent(assertColumn(this.table, searchField));
        // Convex search is fuzzy/prefix oriented; the trigram GIN index in
        // schema.sql backs this ILIKE so it stays indexed rather than scanning.
        where.push(`${col} ILIKE ${p.bind(`%${searchValue}%`)}`);
      }
      for (const e of eqs) {
        const col = quoteIdent(assertColumn(this.table, e.field));
        where.push(`${col} = ${p.bind(encodeValue(this.table, e.field, e.value))}`);
      }
    }

    for (const f of this.filters) where.push(compileExpr(this.table, f, p));

    // Convex sorts by the index fields, then _creationTime. Without an index it
    // sorts by _creationTime alone.
    let orderCols: string[];
    if (this.indexName && !this.searchSpec) {
      orderCols = indexColumns(this.table, this.indexName);
    } else {
      orderCols = ["_creationTime"];
    }
    if (!orderCols.includes("_creationTime")) orderCols = [...orderCols, "_creationTime"];
    // _id makes the sort total, which keyset pagination needs to be stable.
    const orderBy = [...orderCols, "_id"]
      .map((c) => `${quoteIdent(c)} ${this.direction.toUpperCase()}`)
      .join(", ");

    if (after) {
      const cmp = this.direction === "asc" ? ">" : "<";
      where.push(
        `(${quoteIdent("_creationTime")}, ${quoteIdent("_id")}) ${cmp} ` +
          `(${p.bind(after.creationTime)}, ${p.bind(after.id)})`,
      );
    }

    const sql =
      `SELECT * FROM ${quoteIdent(this.table)}` +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      ` ORDER BY ${orderBy}` +
      (limit !== undefined ? ` LIMIT ${p.bind(limit)}` : "");

    return { sql, values: p.values };
  }

  private async run(limit?: number, after?: { creationTime: number; id: string }): Promise<Doc[]> {
    const { sql, values } = this.build(limit, after);
    const res = await this.client.query(sql, values);
    return res.rows.map((r) => decodeRow<Doc>(this.table, r)!);
  }

  async collect(): Promise<Doc[]> {
    return this.run();
  }

  async take(n: number): Promise<Doc[]> {
    return this.run(n);
  }

  async first(): Promise<Doc | null> {
    const rows = await this.run(1);
    return rows[0] ?? null;
  }

  /** Convex throws when a `unique()` query matches more than one document. */
  async unique(): Promise<Doc | null> {
    const rows = await this.run(2);
    if (rows.length > 1) {
      throw new Error(`unique() matched multiple documents in ${this.table}`);
    }
    return rows[0] ?? null;
  }

  async paginate(opts: { numItems: number; cursor?: string | null }): Promise<{
    page: Doc[];
    isDone: boolean;
    continueCursor: string | null;
  }> {
    const after = opts.cursor
      ? (JSON.parse(Buffer.from(opts.cursor, "base64").toString()) as {
          creationTime: number;
          id: string;
        })
      : undefined;

    // Fetch one extra row to determine whether another page exists.
    const rows = await this.run(opts.numItems + 1, after);
    const hasMore = rows.length > opts.numItems;
    const page = hasMore ? rows.slice(0, opts.numItems) : rows;
    const last = page[page.length - 1];

    return {
      page,
      isDone: !hasMore,
      continueCursor:
        hasMore && last
          ? Buffer.from(
              JSON.stringify({ creationTime: last._creationTime, id: last._id }),
            ).toString("base64")
          : null,
    };
  }

  /** Convex queries are async-iterable; a few call sites use `for await`. */
  async *[Symbol.asyncIterator](): AsyncIterator<Doc> {
    for (const doc of await this.collect()) yield doc;
  }
}

// ─── Database reader / writer ────────────────────────────────────────────────

/**
 * Resolves an opaque document ID to its table. Convex encodes the table inside
 * the ID; Postgres cannot dispatch on a value, so _idIndex records it. The
 * cache is process-local and safe because the mapping is immutable once
 * written -- an ID never changes table.
 */
class IdResolver {
  private cache = new Map<string, string>();
  private readonly maxEntries = 50_000;
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  remember(id: string, table: string) {
    if (this.cache.size >= this.maxEntries) this.cache.clear();
    this.cache.set(id, table);
  }

  forget(id: string) {
    this.cache.delete(id);
  }

  async resolve(id: string): Promise<string | null> {
    const hit = this.cache.get(id);
    if (hit) return hit;
    const res = await this.client.query(
      'SELECT "tableName" FROM "_idIndex" WHERE "_id" = $1',
      [id],
    );
    const table = res.rows[0]?.tableName as string | undefined;
    if (table) this.remember(id, table);
    return table ?? null;
  }
}

export class DatabaseReader {
  protected readonly ids: IdResolver;
  protected readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
    this.ids = new IdResolver(client);
  }

  query(table: string): QueryBuilder {
    return new QueryBuilder(this.client, assertTable(table));
  }

  readonly system = {
    get: async (id: string): Promise<Doc | null> => {
      if (!id) return null;
      const res = await this.client.query(
        'SELECT "_id","_creationTime","contentType","size","sha256" FROM "_storage" WHERE "_id" = $1',
        [id],
      );
      const row = res.rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      return {
        ...row,
        _id: String(row._id),
        _creationTime: Number(row._creationTime),
        size: Number(row.size),
      } as Doc;
    },
  };

  async get(id: string): Promise<Doc | null> {
    if (!id) return null;
    const table = await this.ids.resolve(id);
    if (!table) return null;
    const res = await this.client.query(
      `SELECT * FROM ${quoteIdent(table)} WHERE ${quoteIdent("_id")} = $1`,
      [id],
    );
    return decodeRow<Doc>(table, res.rows[0]);
  }
}

export class DatabaseWriter extends DatabaseReader {
  async insert(table: string, doc: Record<string, unknown>): Promise<string> {
    assertTable(table);
    const id = generateId();
    const creationTime = Date.now();

    const cols: string[] = ["_id", "_creationTime"];
    const params: unknown[] = [id, creationTime];

    for (const [key, value] of Object.entries(doc)) {
      if (value === undefined) continue;
      assertColumn(table, key);
      cols.push(key);
      params.push(encodeValue(table, key, value));
    }

    const placeholders = params.map((_, i) => `$${i + 1}`).join(", ");
    await this.client.query(
      `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(", ")}) VALUES (${placeholders})`,
      params,
    );
    await this.client.query(
      'INSERT INTO "_idIndex" ("_id", "tableName") VALUES ($1, $2)',
      [id, table],
    );
    this.ids.remember(id, table);
    return id;
  }

  /** Shallow field merge, matching Convex's patch semantics. */
  async patch(id: string, updates: Record<string, unknown>): Promise<void> {
    const table = await this.ids.resolve(id);
    if (!table) throw new Error(`Document not found: ${id}`);

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [key, value] of Object.entries(updates)) {
      assertColumn(table, key);
      params.push(encodeValue(table, key, value));
      sets.push(`${quoteIdent(key)} = $${params.length}`);
    }
    if (sets.length === 0) return;

    params.push(id);
    const res = await this.client.query(
      `UPDATE ${quoteIdent(table)} SET ${sets.join(", ")} WHERE ${quoteIdent("_id")} = $${params.length}`,
      params,
    );
    if (res.rowCount === 0) throw new Error(`Document not found: ${id}`);
  }

  /** Full document replace, preserving _id and _creationTime. */
  async replace(id: string, doc: Record<string, unknown>): Promise<void> {
    const table = await this.ids.resolve(id);
    if (!table) throw new Error(`Document not found: ${id}`);

    const sets: string[] = [];
    const params: unknown[] = [];
    for (const col of columnsOf(table)) {
      if (col === "_id" || col === "_creationTime") continue;
      params.push(encodeValue(table, col, doc[col]));
      sets.push(`${quoteIdent(col)} = $${params.length}`);
    }
    params.push(id);
    await this.client.query(
      `UPDATE ${quoteIdent(table)} SET ${sets.join(", ")} WHERE ${quoteIdent("_id")} = $${params.length}`,
      params,
    );
  }

  async delete(id: string): Promise<void> {
    const table = await this.ids.resolve(id);
    if (!table) return;
    await this.client.query(
      `DELETE FROM ${quoteIdent(table)} WHERE ${quoteIdent("_id")} = $1`,
      [id],
    );
    await this.client.query('DELETE FROM "_idIndex" WHERE "_id" = $1', [id]);
    this.ids.forget(id);
  }
}
