import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

import type { Db } from '../db/pool';
import { useTestDb } from '../test/db';
import { seedOwner } from '../test/seed';
import { findOrCreateOwner } from './accounts';

const testDb = useTestDb();
const NOW = new Date('2026-10-05T10:00:00.000Z');

/** Waits until the backend of `pid` is blocked on a lock. */
async function waitUntilBlocked(db: Db, pid: number) {
  for (let i = 0; i < 200; i++) {
    const res = await db.query<{ wait_event_type: string | null }>(
      'SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1',
      [pid],
    );
    if (res.rows[0]?.wait_event_type === 'Lock') return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('second transaction never blocked');
}

async function count(db: Db, table: 'owners' | 'shops'): Promise<number> {
  const res = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return res.rows[0]!.n;
}

describe('findOrCreateOwner', () => {
  it('creates a new owner with an empty shop', async () => {
    const client = await testDb.db.connect();
    try {
      const res = await findOrCreateOwner(client, '+2250700000001', NOW);
      expect(res.isNew).toBe(true);
      expect(res.owner).toEqual({ id: expect.any(String), phone: '+2250700000001', firstName: '' });
      const shop = await testDb.db.query('SELECT owner_id, name, created_at FROM shops WHERE id = $1', [res.shopId]);
      expect(shop.rows[0]).toEqual({ owner_id: res.owner.id, name: '', created_at: NOW });
    } finally {
      client.release();
    }
  });

  it('returns an existing owner and their shop', async () => {
    const seeded = await seedOwner(testDb.db, { phone: '+2250700000002', firstName: 'Awa' });
    const client = await testDb.db.connect();
    try {
      const res = await findOrCreateOwner(client, '+2250700000002', NOW);
      expect(res).toEqual({
        owner: { id: seeded.ownerId, phone: '+2250700000002', firstName: 'Awa' },
        shopId: seeded.shopId,
        isNew: false,
      });
    } finally {
      client.release();
    }
  });

  it('creates exactly one owner and one shop when two logins of a new number race', async () => {
    const phone = '+2250700000003';
    const a: PoolClient = await testDb.db.connect();
    const b: PoolClient = await testDb.db.connect();
    try {
      const bPid = (await b.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await a.query('BEGIN');
      await b.query('BEGIN');
      const first = await findOrCreateOwner(a, phone, NOW); // inserted, not committed yet
      const secondPromise = findOrCreateOwner(b, phone, NOW); // blocks on the unique phone index
      await waitUntilBlocked(testDb.db, bPid);
      await a.query('COMMIT');
      const second = await secondPromise;
      await b.query('COMMIT');

      expect(first.isNew).toBe(true);
      expect(second.isNew).toBe(false);
      expect(second.owner.id).toBe(first.owner.id);
      expect(second.shopId).toBe(first.shopId);
      expect(await count(testDb.db, 'owners')).toBe(1);
      expect(await count(testDb.db, 'shops')).toBe(1);
    } finally {
      await a.query('ROLLBACK').catch(() => {});
      await b.query('ROLLBACK').catch(() => {});
      a.release();
      b.release();
    }
  });
});
