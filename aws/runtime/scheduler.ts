/**
 * ctx.scheduler — durable job queue replacing Convex's scheduler.
 *
 * All six call sites in convex/ are `runAfter(0, ...)` fire-and-forget work:
 * invoice and status emails, the org invite email, AI workflow generation and
 * a push notification.
 *
 * Convex guarantees a scheduled call is only enqueued if the surrounding
 * mutation commits. Writing the job to _scheduledFunctions on the mutation's
 * own connection preserves that: a rollback discards the job too. A separate
 * drainer (EventBridge Scheduler -> Lambda) executes due jobs, so a failed
 * email can never roll back the invoice that triggered it.
 */
import type { PoolClient } from "pg";
import { generateId } from "./db.ts";
import { referencePath } from "./functions.ts";

export class Scheduler {
  private readonly client: PoolClient;

  constructor(client: PoolClient) {
    this.client = client;
  }

  /** Enqueue `fn` to run at least `delayMs` from now. */
  async runAfter(delayMs: number, fn: unknown, args: Record<string, unknown> = {}): Promise<string> {
    return this.enqueue(Date.now() + Math.max(0, delayMs), fn, args);
  }

  /** Enqueue `fn` to run at an absolute epoch-millisecond timestamp. */
  async runAt(timestampMs: number, fn: unknown, args: Record<string, unknown> = {}): Promise<string> {
    return this.enqueue(timestampMs, fn, args);
  }

  async cancel(jobId: string): Promise<void> {
    await this.client.query(
      `UPDATE "_scheduledFunctions" SET "state" = 'canceled'
       WHERE "_id" = $1 AND "state" = 'pending'`,
      [jobId],
    );
  }

  private async enqueue(
    scheduledFor: number,
    fn: unknown,
    args: Record<string, unknown>,
  ): Promise<string> {
    const id = generateId();
    await this.client.query(
      `INSERT INTO "_scheduledFunctions"
         ("_id","_creationTime","functionPath","args","scheduledFor","state")
       VALUES ($1,$2,$3,$4,$5,'pending')`,
      [id, Date.now(), referencePath(fn), JSON.stringify(args), scheduledFor],
    );
    return id;
  }
}

export type ScheduledJob = {
  _id: string;
  functionPath: string;
  args: Record<string, unknown>;
  attempts: number;
};

const MAX_ATTEMPTS = 5;

/**
 * Claims up to `limit` due jobs for execution.
 *
 * SKIP LOCKED lets several drainer invocations run concurrently without any
 * job being picked up twice, and the state flip to 'inProgress' happens in the
 * same statement that selects it.
 */
export async function claimDueJobs(client: PoolClient, limit = 10): Promise<ScheduledJob[]> {
  const res = await client.query(
    `UPDATE "_scheduledFunctions" SET "state" = 'inProgress', "attempts" = "attempts" + 1
     WHERE "_id" IN (
       SELECT "_id" FROM "_scheduledFunctions"
       WHERE "state" = 'pending' AND "scheduledFor" <= $1
       ORDER BY "scheduledFor"
       LIMIT $2
       FOR UPDATE SKIP LOCKED
     )
     RETURNING "_id","functionPath","args","attempts"`,
    [Date.now(), limit],
  );
  return res.rows as ScheduledJob[];
}

export async function markJobSucceeded(client: PoolClient, jobId: string): Promise<void> {
  await client.query(
    `UPDATE "_scheduledFunctions" SET "state" = 'success', "completedAt" = $2 WHERE "_id" = $1`,
    [jobId, Date.now()],
  );
}

/** Retries with backoff until MAX_ATTEMPTS, then parks the job as failed. */
export async function markJobFailed(
  client: PoolClient,
  job: ScheduledJob,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const giveUp = job.attempts >= MAX_ATTEMPTS;
  const backoffMs = Math.min(2 ** job.attempts * 1000, 5 * 60 * 1000);

  await client.query(
    `UPDATE "_scheduledFunctions"
     SET "state" = $2, "lastError" = $3, "scheduledFor" = $4, "completedAt" = $5
     WHERE "_id" = $1`,
    [
      job._id,
      giveUp ? "failed" : "pending",
      message,
      giveUp ? Date.now() : Date.now() + backoffMs,
      giveUp ? Date.now() : null,
    ],
  );
}
