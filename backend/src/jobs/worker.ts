/**
 * Worker loop for the `jobs` table. Several workers can run side by side:
 * a job is claimed with FOR UPDATE SKIP LOCKED, so only one of them gets it.
 *
 * A handler that throws is retried with exponential backoff until
 * max_attempts, then the job is kept with failed_at set (for debugging).
 * Handlers must be safe to run twice: a worker can die after doing the work
 * but before deleting the job.
 */
import type { DbClient } from '../db/pool';
import type { AppDeps, Clock } from '../deps';

export type JobContext = {
  jobId: number;
  /** 1 on the first run. */
  attempt: number;
  maxAttempts: number;
};

/** `payload` is the job's JSON as stored: each handler validates its own. */
export type JobHandler = (payload: any, ctx: JobContext) => Promise<void>;

export type JobRow = {
  id: number;
  kind: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
};

type WorkerDeps = Pick<AppDeps, 'db' | 'clock' | 'log'>;

const RETRY_BASE_MS = 5_000;
const RETRY_MAX_MS = 10 * 60_000;
export const STALE_LOCK_MS = 5 * 60_000;
const STALE_CHECK_EVERY_MS = 60_000;

/** 5 s, 10 s, 20 s… capped at 10 minutes. */
export function retryDelayMs(attempt: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** Math.max(attempt - 1, 0), RETRY_MAX_MS);
}

/** Locks the next ready job for `workerId`, clears its key and counts the attempt. */
export async function claimNextJob(db: DbClient, clock: Clock, workerId: string): Promise<JobRow | null> {
  const res = await db.query<JobRow>(
    `UPDATE jobs
        SET locked_at = $1, locked_by = $2, key = NULL, attempts = attempts + 1
      WHERE id = (SELECT id FROM jobs
                   WHERE locked_at IS NULL AND failed_at IS NULL AND run_at <= $1
                   ORDER BY run_at, id
                   LIMIT 1
                   FOR UPDATE SKIP LOCKED)
      RETURNING id, kind, payload, attempts, max_attempts`,
    [clock.now(), workerId],
  );
  return res.rows[0] ?? null;
}

/** Runs one ready job. Returns false when no job is ready. */
export async function processNextJob(
  deps: WorkerDeps,
  handlers: Record<string, JobHandler>,
  workerId: string,
): Promise<boolean> {
  const job = await claimNextJob(deps.db, deps.clock, workerId);
  if (!job) return false;

  // `attempts` changes on every claim, so these updates never touch a job
  // that was released as stale and claimed again by another worker.
  const handler = Object.hasOwn(handlers, job.kind) ? handlers[job.kind] : undefined;
  if (!handler) {
    await failJob(deps, job, `unknown job kind: ${job.kind}`);
    return true;
  }

  try {
    await handler(job.payload, { jobId: job.id, attempt: job.attempts, maxAttempts: job.max_attempts });
  } catch (err) {
    const error = errorText(err);
    if (job.attempts < job.max_attempts) {
      const runAt = new Date(deps.clock.now().getTime() + retryDelayMs(job.attempts));
      await deps.db.query(
        `UPDATE jobs SET locked_at = NULL, locked_by = NULL, run_at = $3, last_error = $4
          WHERE id = $1 AND attempts = $2`,
        [job.id, job.attempts, runAt, error],
      );
      deps.log.warn('job failed, will retry', { jobId: job.id, kind: job.kind, attempt: job.attempts, error });
    } else {
      await failJob(deps, job, error);
    }
    return true;
  }

  await deps.db.query('DELETE FROM jobs WHERE id = $1 AND attempts = $2', [job.id, job.attempts]);
  return true;
}

async function failJob(deps: WorkerDeps, job: JobRow, error: string): Promise<void> {
  await deps.db.query('UPDATE jobs SET failed_at = $3, last_error = $4 WHERE id = $1 AND attempts = $2', [
    job.id,
    job.attempts,
    deps.clock.now(),
    error,
  ]);
  deps.log.error('job failed for good', { jobId: job.id, kind: job.kind, attempts: job.attempts, error });
}

/**
 * Unlocks jobs whose worker died or hung (locked for more than `olderThanMs`)
 * so another worker picks them up. A job already at max_attempts is failed
 * instead, so a job that crashes its worker can't loop forever.
 * Returns how many jobs were released or failed.
 */
export async function releaseStaleLocks(db: DbClient, clock: Clock, olderThanMs = STALE_LOCK_MS): Promise<number> {
  const now = clock.now();
  const res = await db.query(
    `UPDATE jobs
        SET locked_at = NULL, locked_by = NULL,
            failed_at = CASE WHEN attempts >= max_attempts THEN $2::timestamptz END,
            last_error = 'lock expired: the worker stopped or took too long'
      WHERE locked_at < $1 AND failed_at IS NULL`,
    [new Date(now.getTime() - olderThanMs), now],
  );
  return res.rowCount ?? 0;
}

export type RunWorkerOptions = {
  workerId: string;
  /** Wait between polls when no job is ready. */
  pollMs?: number;
  signal: AbortSignal;
};

/**
 * Processes jobs until `signal` aborts. A job in progress is finished first.
 * Unexpected errors (database down…) are logged and the loop carries on.
 */
export async function runWorker(
  deps: WorkerDeps,
  handlers: Record<string, JobHandler>,
  { workerId, pollMs = 1000, signal }: RunWorkerOptions,
): Promise<void> {
  let lastStaleCheck = Number.NEGATIVE_INFINITY;
  while (!signal.aborted) {
    let worked = false;
    try {
      const now = deps.clock.now().getTime();
      if (now - lastStaleCheck >= STALE_CHECK_EVERY_MS) {
        lastStaleCheck = now;
        const released = await releaseStaleLocks(deps.db, deps.clock);
        if (released > 0) deps.log.warn('worker: released stale job locks', { count: released });
      }
      worked = await processNextJob(deps, handlers, workerId);
    } catch (err) {
      deps.log.error('worker: unexpected error', { workerId, error: errorText(err) });
    }
    if (!worked) await sleep(pollMs, signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
  });
}

function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message || err.name : String(err);
  return text.slice(0, 2000);
}
