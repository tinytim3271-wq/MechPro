/**
 * EventBridge-triggered scheduled-job drainer.
 *
 * Claims due rows from `_scheduledFunctions` (SKIP LOCKED), executes each
 * through the Convex-compat Runtime, and marks success / retry / failure.
 * Emails, AI workflows and push notifications all land here via runAfter(0).
 */
import type { PoolClient } from "pg";
import {
  claimDueJobs,
  lookup,
  markJobFailed,
  markJobSucceeded,
  Runtime,
} from "../generated/registry.ts";
import { getRuntime } from "./shared.ts";

const BATCH = Number(process.env.DRAINER_BATCH_SIZE ?? "10");

export async function handler(): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const { pool, runtime } = await getRuntime();
  const client = await pool.connect();
  let claimed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const jobs = await claimDueJobs(client, BATCH);
    claimed = jobs.length;

    for (const job of jobs) {
      try {
        await executeJob(runtime, job.functionPath, job.args);
        await markJobSucceeded(client, job._id);
        succeeded += 1;
      } catch (err) {
        console.error(`Job ${job._id} (${job.functionPath}) failed`, err);
        await markJobFailed(client, job, err);
        failed += 1;
      } finally {
        runtime.releaseBorrowed();
      }
    }
  } finally {
    client.release();
  }

  return { claimed, succeeded, failed };
}

async function executeJob(
  runtime: Runtime,
  functionPath: string,
  args: Record<string, unknown>,
): Promise<void> {
  const fn = lookup(functionPath);
  // Scheduled work runs as the system, not as the user who enqueued it —
  // matching Convex's scheduler identity model.
  await runtime.execute(fn, args ?? {}, null);
}

/** Test helper: drain with an injected client (used by unit tests). */
export async function drainWithClient(
  runtime: Runtime,
  client: PoolClient,
  limit = BATCH,
): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const jobs = await claimDueJobs(client, limit);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await executeJob(runtime, job.functionPath, job.args);
      await markJobSucceeded(client, job._id);
      succeeded += 1;
    } catch (err) {
      await markJobFailed(client, job, err);
      failed += 1;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}
