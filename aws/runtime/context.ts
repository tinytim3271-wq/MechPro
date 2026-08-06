/**
 * Builds QueryCtx / MutationCtx / ActionCtx and executes registered functions.
 *
 * Transaction model, mirroring Convex:
 *  - A query runs in one REPEATABLE READ, READ ONLY transaction, so every read
 *    inside it sees a single consistent snapshot and the database refuses any
 *    accidental write.
 *  - A mutation runs in one read-write transaction that commits on return and
 *    rolls back on throw, making the handler atomic. Nested ctx.runQuery and
 *    ctx.runMutation join that same transaction rather than opening their own.
 *  - An action has no transaction and no ctx.db, exactly as in Convex. Each of
 *    its ctx.runQuery / ctx.runMutation calls gets its own connection and
 *    commits independently, which is why actions may observe partial state.
 */
import type { Pool, PoolClient } from "pg";
import { Auth, bearerToken, type TokenVerifier } from "./auth.ts";
import { DatabaseReader, DatabaseWriter } from "./db.ts";
import { lookup, type RegisteredFunction } from "./functions.ts";
import { Scheduler } from "./scheduler.ts";
import { Storage, type StorageConfig } from "./storage.ts";

export type RuntimeConfig = {
  pool: Pool;
  verifyToken: TokenVerifier;
  storage: StorageConfig;
};

export type QueryCtx = {
  db: DatabaseReader;
  auth: Auth;
  storage: Storage;
  runQuery: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
};

export type MutationCtx = QueryCtx & {
  db: DatabaseWriter;
  scheduler: Scheduler;
  runMutation: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
};

export type ActionCtx = {
  auth: Auth;
  storage: Storage;
  scheduler: Scheduler;
  runQuery: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
  runMutation: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
  runAction: (ref: unknown, args?: Record<string, unknown>) => Promise<unknown>;
};

export class Runtime {
  private readonly pool: Pool;
  private readonly verifyToken: TokenVerifier;
  private readonly storageConfig: StorageConfig;

  constructor(config: RuntimeConfig) {
    this.pool = config.pool;
    this.verifyToken = config.verifyToken;
    this.storageConfig = config.storage;
  }

  /** Entry point used by the HTTP router and the scheduled-job drainer. */
  async execute(
    fn: RegisteredFunction,
    args: Record<string, unknown>,
    token: string | null,
  ): Promise<unknown> {
    switch (fn.kind) {
      case "query":
        return this.runInTransaction(fn, args, token, { readOnly: true });
      case "mutation":
        return this.runInTransaction(fn, args, token, { readOnly: false });
      case "action":
        return this.runAction(fn, args, token);
    }
  }

  async executeByReference(
    ref: unknown,
    args: Record<string, unknown>,
    token: string | null,
  ): Promise<unknown> {
    return this.execute(lookup(ref), args, token);
  }

  // ─── Query / mutation ──────────────────────────────────────────────────────

  private async runInTransaction(
    fn: RegisteredFunction,
    args: Record<string, unknown>,
    token: string | null,
    opts: { readOnly: boolean },
  ): Promise<unknown> {
    const client = await this.pool.connect();
    try {
      await client.query(
        opts.readOnly
          ? "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
          : "BEGIN",
      );
      const ctx = opts.readOnly
        ? this.queryCtx(client, token)
        : this.mutationCtx(client, token);

      const result = await fn.handler(ctx as never, args as never);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private queryCtx(client: PoolClient, token: string | null): QueryCtx {
    const ctx: QueryCtx = {
      db: new DatabaseReader(client),
      auth: new Auth(token, this.verifyToken),
      storage: new Storage(client, this.storageConfig),
      // Joins the caller's transaction so nested reads share its snapshot.
      runQuery: (ref, nested = {}) => this.runNested(client, ref, nested, token, "query"),
    };
    return ctx;
  }

  private mutationCtx(client: PoolClient, token: string | null): MutationCtx {
    const ctx: MutationCtx = {
      db: new DatabaseWriter(client),
      auth: new Auth(token, this.verifyToken),
      storage: new Storage(client, this.storageConfig),
      scheduler: new Scheduler(client),
      runQuery: (ref, nested = {}) => this.runNested(client, ref, nested, token, "query"),
      runMutation: (ref, nested = {}) => this.runNested(client, ref, nested, token, "mutation"),
    };
    return ctx;
  }

  /**
   * Runs a nested function on the caller's connection, so the whole chain is
   * one atomic unit. A mutation may call a query, but a query may not call a
   * mutation -- the read-only transaction would reject the write anyway, and
   * failing here gives a clearer error.
   */
  private async runNested(
    client: PoolClient,
    ref: unknown,
    args: Record<string, unknown>,
    token: string | null,
    callerKind: "query" | "mutation",
  ): Promise<unknown> {
    const fn = lookup(ref);
    if (fn.kind === "action") {
      throw new Error("Cannot call an action from a query or mutation; use ctx.scheduler");
    }
    if (callerKind === "query" && fn.kind === "mutation") {
      throw new Error("Cannot call a mutation from a query");
    }
    const ctx = fn.kind === "query" ? this.queryCtx(client, token) : this.mutationCtx(client, token);
    return fn.handler(ctx as never, args as never);
  }

  // ─── Action ────────────────────────────────────────────────────────────────

  private async runAction(
    fn: RegisteredFunction,
    args: Record<string, unknown>,
    token: string | null,
  ): Promise<unknown> {
    // Actions hold no transaction, so each nested call takes its own
    // connection. Storage and scheduler still need one; it is acquired per use
    // rather than held for the action's lifetime, which may involve slow
    // third-party calls that must not pin a pool connection.
    const ctx: ActionCtx = {
      auth: new Auth(token, this.verifyToken),
      storage: new Storage(await this.borrow(), this.storageConfig),
      scheduler: new Scheduler(await this.borrow()),
      runQuery: (ref, nested = {}) => this.executeByReference(ref, nested, token),
      runMutation: (ref, nested = {}) => this.executeByReference(ref, nested, token),
      runAction: (ref, nested = {}) => this.executeByReference(ref, nested, token),
    };
    return fn.handler(ctx as never, args as never);
  }

  /**
   * Connection for the action-scoped helpers above. Actions are rare and
   * short-lived relative to pool size; the connection returns to the pool when
   * the Lambda invocation ends.
   */
  private borrowed: PoolClient[] = [];
  private async borrow(): Promise<PoolClient> {
    const client = await this.pool.connect();
    this.borrowed.push(client);
    return client;
  }

  /** Releases anything an action borrowed. Call once per invocation. */
  releaseBorrowed(): void {
    for (const client of this.borrowed) client.release();
    this.borrowed = [];
  }
}
