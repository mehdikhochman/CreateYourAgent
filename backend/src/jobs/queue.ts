/**
 * Job queue on the `jobs` table (design doc §3, "Worker process"). The worker
 * side is in ./worker.ts.
 */
import type { DbClient } from '../db/pool';
import type { Clock, EnqueueJob, JobQueue } from '../deps';

export const DEFAULT_MAX_ATTEMPTS = 5;

export class PgJobQueue implements JobQueue {
  constructor(
    private readonly db: DbClient,
    private readonly clock: Clock,
  ) {}

  /**
   * Without a key, adds a job. With a key, a job still waiting under that key
   * gets the new payload and run time instead (debounce). Claiming a job clears
   * its key, so a running job never blocks a new one.
   */
  async enqueue(job: EnqueueJob, client?: DbClient): Promise<void> {
    const db = client ?? this.db;
    const now = this.clock.now();
    const params = [job.kind, JSON.stringify(job.payload), job.runAt ?? now, job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, now];
    if (!job.key) {
      await db.query(
        `INSERT INTO jobs (kind, payload, run_at, max_attempts, created_at) VALUES ($1, $2, $3, $4, $5)`,
        params,
      );
      return;
    }
    await db.query(
      `INSERT INTO jobs (kind, payload, run_at, max_attempts, created_at, key) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (key) DO UPDATE
         SET kind = EXCLUDED.kind, payload = EXCLUDED.payload,
             run_at = EXCLUDED.run_at, max_attempts = EXCLUDED.max_attempts`,
      [...params, job.key],
    );
  }
}
