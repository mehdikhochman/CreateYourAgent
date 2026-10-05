import type { Db } from '../db/pool';

/**
 * Runs `fn` while holding a Postgres advisory lock on `key`, so two workers
 * never answer the same conversation (or send the same message) at once.
 * Returns false, without running `fn`, when another session holds the lock.
 *
 * The lock is held by a dedicated connection; closing that connection (crash)
 * frees it too.
 */
export async function withAdvisoryLock(db: Db, key: string, fn: () => Promise<void>): Promise<boolean> {
  const client = await db.connect();
  let healthy = false;
  try {
    const res = await client.query<{ locked: boolean }>('SELECT pg_try_advisory_lock(hashtext($1)) AS locked', [key]);
    if (!res.rows[0]?.locked) {
      healthy = true;
      return false;
    }
    try {
      await fn();
    } finally {
      healthy = await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).then(
        () => true,
        () => false,
      );
    }
    return true;
  } finally {
    // A connection that couldn't unlock is closed, which releases the lock.
    client.release(!healthy);
  }
}
