import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { FakeClock, SilentLogger } from '../test/fakes';
import { PgJobQueue } from './queue';
import { claimNextJob, type JobHandler, processNextJob, releaseStaleLocks, retryDelayMs, runWorker } from './worker';

const testDb = useTestDb();

type JobState = {
  id: number;
  attempts: number;
  run_at: Date;
  locked_at: Date | null;
  locked_by: string | null;
  failed_at: Date | null;
  last_error: string | null;
};

async function jobState(): Promise<JobState[]> {
  const res = await testDb.db.query<JobState>(
    'SELECT id, attempts, run_at, locked_at, locked_by, failed_at, last_error FROM jobs ORDER BY id',
  );
  return res.rows;
}

function setup() {
  const clock = new FakeClock();
  const log = new SilentLogger();
  const deps = { db: testDb.db, clock, log };
  const queue = new PgJobQueue(testDb.db, clock);
  return { clock, log, deps, queue };
}

describe('processNextJob', () => {
  it('returns false when nothing is ready, and skips jobs scheduled later', async () => {
    const { deps, queue, clock } = setup();
    expect(await processNextJob(deps, {}, 'w1')).toBe(false);
    await queue.enqueue({ kind: 'x', payload: {}, runAt: new Date(clock.now().getTime() + 1000) });
    expect(await processNextJob(deps, { x: async () => {} }, 'w1')).toBe(false);
    clock.advance(1000);
    expect(await processNextJob(deps, { x: async () => {} }, 'w1')).toBe(true);
  });

  it('runs the handler with the payload and deletes the job on success', async () => {
    const { deps, queue } = setup();
    await queue.enqueue({ kind: 'hello', payload: { name: 'Awa' } });
    const seen: unknown[] = [];
    const handler: JobHandler = async (payload, ctx) => {
      seen.push({ payload, ctx });
    };
    expect(await processNextJob(deps, { hello: handler }, 'w1')).toBe(true);
    expect(seen).toEqual([{ payload: { name: 'Awa' }, ctx: { jobId: expect.any(Number), attempt: 1, maxAttempts: 5 } }]);
    expect(await jobState()).toEqual([]);
  });

  it('runs jobs in run_at order', async () => {
    const { deps, queue, clock } = setup();
    await queue.enqueue({ kind: 'x', payload: { n: 2 }, runAt: new Date(clock.now().getTime() - 1000) });
    await queue.enqueue({ kind: 'x', payload: { n: 1 }, runAt: new Date(clock.now().getTime() - 2000) });
    const order: number[] = [];
    const handlers = { x: async (p: { n: number }) => void order.push(p.n) };
    while (await processNextJob(deps, handlers, 'w1'));
    expect(order).toEqual([1, 2]);
  });

  it('retries with exponential backoff, then fails for good after max attempts', async () => {
    const { deps, queue, clock, log } = setup();
    await queue.enqueue({ kind: 'flaky', payload: {}, maxAttempts: 3 });
    const attempts: number[] = [];
    const handlers = {
      flaky: async (_: unknown, ctx: { attempt: number }) => {
        attempts.push(ctx.attempt);
        throw new Error(`boom ${ctx.attempt}`);
      },
    };

    await processNextJob(deps, handlers, 'w1');
    let [job] = await jobState();
    expect(job).toMatchObject({ attempts: 1, locked_at: null, locked_by: null, failed_at: null, last_error: 'boom 1' });
    expect(job!.run_at).toEqual(new Date(clock.now().getTime() + 5_000));

    // Not ready before its new run time.
    expect(await processNextJob(deps, handlers, 'w1')).toBe(false);
    clock.advance(5_000);
    await processNextJob(deps, handlers, 'w1');
    [job] = await jobState();
    expect(job!.run_at).toEqual(new Date(clock.now().getTime() + 10_000));

    clock.advance(10_000);
    await processNextJob(deps, handlers, 'w1');
    [job] = await jobState();
    expect(job).toMatchObject({ attempts: 3, failed_at: clock.now(), last_error: 'boom 3' });
    expect(attempts).toEqual([1, 2, 3]);
    expect(log.lines.some((l) => l.level === 'error' && l.msg === 'job failed for good')).toBe(true);

    // A failed job is never picked up again.
    clock.advance(3_600_000);
    expect(await processNextJob(deps, handlers, 'w1')).toBe(false);
  });

  it('caps the backoff at 10 minutes', () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([5_000, 10_000, 20_000, 40_000]);
    expect(retryDelayMs(8)).toBe(600_000);
    expect(retryDelayMs(30)).toBe(600_000);
  });

  it('fails a job of unknown kind at once', async () => {
    const { deps, queue, clock } = setup();
    await queue.enqueue({ kind: 'nope', payload: {} });
    expect(await processNextJob(deps, {}, 'w1')).toBe(true);
    const [job] = await jobState();
    expect(job).toMatchObject({ attempts: 1, failed_at: clock.now(), last_error: 'unknown job kind: nope' });
  });

  it('does not treat inherited object keys as handlers', async () => {
    const { deps, queue } = setup();
    await queue.enqueue({ kind: 'toString', payload: {} });
    await processNextJob(deps, {}, 'w1');
    const [job] = await jobState();
    expect(job!.last_error).toBe('unknown job kind: toString');
  });
});

describe('claimNextJob', () => {
  it('never gives the same job to two concurrent workers', async () => {
    const { queue, clock } = setup();
    for (let i = 0; i < 30; i++) await queue.enqueue({ kind: 'x', payload: { i } });
    const claimAll = async (worker: string) => {
      const ids: number[] = [];
      for (;;) {
        const job = await claimNextJob(testDb.db, clock, worker);
        if (!job) return ids;
        ids.push(job.id);
      }
    };
    const results = await Promise.all(['w1', 'w2', 'w3', 'w4'].map(claimAll));
    const all = results.flat();
    expect(all).toHaveLength(30);
    expect(new Set(all).size).toBe(30);
  });
});

describe('releaseStaleLocks', () => {
  it('unlocks jobs locked for too long, and fails those out of attempts', async () => {
    const { queue, clock } = setup();
    await queue.enqueue({ kind: 'a', payload: {} });
    await queue.enqueue({ kind: 'b', payload: {}, maxAttempts: 1 });
    await claimNextJob(testDb.db, clock, 'dead-worker');
    await claimNextJob(testDb.db, clock, 'dead-worker');

    clock.advance(4 * 60_000);
    expect(await releaseStaleLocks(testDb.db, clock)).toBe(0);

    clock.advance(2 * 60_000);
    expect(await releaseStaleLocks(testDb.db, clock)).toBe(2);
    const [a, b] = await jobState();
    expect(a).toMatchObject({ locked_at: null, locked_by: null, failed_at: null, attempts: 1 });
    expect(b).toMatchObject({ locked_at: null, failed_at: clock.now(), attempts: 1 });

    const again = await claimNextJob(testDb.db, clock, 'w2');
    expect(again).toMatchObject({ kind: 'a', attempts: 2 });
  });

  it("doesn't let the stale worker delete a job another worker has claimed since", async () => {
    const { deps, queue, clock } = setup();
    await queue.enqueue({ kind: 'slow', payload: {} });
    let release: () => void = () => {};
    const slow = new Promise<void>((r) => (release = r));
    const running = processNextJob(deps, { slow: () => slow }, 'w1');
    // Wait until w1 has claimed the job.
    for (let i = 0; i < 50 && (await jobState())[0]?.locked_by !== 'w1'; i++) await new Promise((r) => setTimeout(r, 10));

    clock.advance(6 * 60_000);
    await releaseStaleLocks(testDb.db, clock);
    const reclaimed = await claimNextJob(testDb.db, clock, 'w2');
    expect(reclaimed).toMatchObject({ attempts: 2 });

    release();
    await running;
    // w1 finished late: the job w2 holds is still there.
    expect(await jobState()).toMatchObject([{ locked_by: 'w2', attempts: 2 }]);
  });
});

describe('runWorker', () => {
  it('processes jobs until aborted and survives handler and database errors', async () => {
    const { deps, queue } = setup();
    const done: number[] = [];
    const controller = new AbortController();
    await queue.enqueue({ kind: 'x', payload: { n: 1 } });
    await queue.enqueue({ kind: 'bad', payload: {}, maxAttempts: 1 });
    await queue.enqueue({ kind: 'x', payload: { n: 2 } });

    let dbFailures = 1;
    const flakyDb = new Proxy(testDb.db, {
      get(target, prop, receiver) {
        if (prop === 'query' && dbFailures > 0) {
          dbFailures -= 1;
          return async () => {
            throw new Error('connection reset');
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });

    const handlers = {
      x: async (p: { n: number }) => {
        done.push(p.n);
        if (done.length === 2) controller.abort();
      },
      bad: async () => {
        throw new Error('bad job');
      },
    };
    await runWorker({ ...deps, db: flakyDb }, handlers, { workerId: 'w1', pollMs: 5, signal: controller.signal });
    expect(done).toEqual([1, 2]);
    expect(deps.log.lines.some((l) => l.msg === 'worker: unexpected error')).toBe(true);
    expect(await jobState()).toMatchObject([{ last_error: 'bad job', failed_at: expect.any(Date) }]);
  });

  it('stops promptly when aborted while idle', async () => {
    const { deps } = setup();
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 20);
    await runWorker(deps, {}, { workerId: 'w1', pollMs: 60_000, signal: controller.signal });
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
