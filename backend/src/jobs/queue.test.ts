import { describe, expect, it } from 'vitest';

import { withTransaction } from '../db/pool';
import { useTestDb } from '../test/db';
import { FakeClock } from '../test/fakes';
import { PgJobQueue } from './queue';
import { claimNextJob } from './worker';

const testDb = useTestDb();

type Row = { id: number; kind: string; key: string | null; payload: unknown; run_at: Date; max_attempts: number };

async function jobs(): Promise<Row[]> {
  const res = await testDb.db.query<Row>('SELECT id, kind, key, payload, run_at, max_attempts FROM jobs ORDER BY id');
  return res.rows;
}

describe('PgJobQueue', () => {
  it('adds a job that runs now by default', async () => {
    const clock = new FakeClock();
    const queue = new PgJobQueue(testDb.db, clock);
    await queue.enqueue({ kind: 'reply', payload: { conversationId: 'c1' } });
    await queue.enqueue({ kind: 'reply', payload: { conversationId: 'c1' } });
    const rows = await jobs();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: 'reply', key: null, payload: { conversationId: 'c1' }, max_attempts: 5 });
    expect(rows[0]!.run_at).toEqual(clock.now());
  });

  it('enqueues inside the caller\'s transaction: committed together, rolled back together', async () => {
    const queue = new PgJobQueue(testDb.db, new FakeClock());
    await expect(
      withTransaction(testDb.db, async (tx) => {
        await queue.enqueue({ kind: 'reply', payload: { n: 1 } }, tx);
        throw new Error('the message insert failed');
      }),
    ).rejects.toThrow('the message insert failed');
    expect(await jobs()).toHaveLength(0);

    await withTransaction(testDb.db, (tx) => queue.enqueue({ kind: 'reply', payload: { n: 2 } }, tx));
    expect(await jobs()).toHaveLength(1);
  });

  it('debounces a waiting job with the same key', async () => {
    const clock = new FakeClock();
    const queue = new PgJobQueue(testDb.db, clock);
    await queue.enqueue({ kind: 'reply', key: 'reply:c1', payload: { n: 1 }, runAt: new Date(clock.now().getTime() + 4000) });
    clock.advance(2000);
    const later = new Date(clock.now().getTime() + 4000);
    await queue.enqueue({ kind: 'reply', key: 'reply:c1', payload: { n: 2 }, runAt: later, maxAttempts: 3 });
    const rows = await jobs();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'reply:c1', payload: { n: 2 }, max_attempts: 3 });
    expect(rows[0]!.run_at).toEqual(later);
  });

  it('adds a second job once the first one is claimed (its key is cleared)', async () => {
    const clock = new FakeClock();
    const queue = new PgJobQueue(testDb.db, clock);
    await queue.enqueue({ kind: 'reply', key: 'reply:c1', payload: { n: 1 } });
    const claimed = await claimNextJob(testDb.db, clock, 'w1');
    expect(claimed).toMatchObject({ kind: 'reply', attempts: 1 });
    await queue.enqueue({ kind: 'reply', key: 'reply:c1', payload: { n: 2 } });
    const rows = await jobs();
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.key)).toEqual([null, 'reply:c1']);
  });
});
