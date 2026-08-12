/**
 * Drop-in replacement for convex/_generated/dataModel.
 *
 * Every reference to Doc and Id in convex/ is a type-only import, so nothing
 * here survives to runtime -- this exists so the bundler can resolve the
 * specifier without Convex codegen.
 *
 * The definitions are intentionally permissive. Generating exact per-table
 * types from aws/db/schema.json would restore full type checking on the ported
 * modules and is worth doing before the port is finished; until then the
 * modules keep the types they were written and type-checked against under
 * Convex.
 */

/** Opaque document id. Convex brands these per table; the brand is erased. */
export type Id<TableName extends string = string> = string & { __table?: TableName };

export type Doc<TableName extends string = string> = {
  _id: Id<TableName>;
  _creationTime: number;
} & Record<string, unknown>;

export type TableNames = string;
export type DataModel = Record<string, unknown>;
export type Document<TableName extends string = string> = Doc<TableName>;
