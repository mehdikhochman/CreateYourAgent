import { describe, expect, it } from 'vitest';

import { loadShopProfile } from '../domain/profile-repo';
import { useTestDb } from './db';
import { seedDemoProfile, seedOwner } from './seed';

const testDb = useTestDb();

describe('foundation', () => {
  it('migrates, seeds and loads a profile', async () => {
    const owner = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, owner.shopId);
    const profile = await loadShopProfile(testDb.db, owner.shopId);
    expect(profile?.catalog.map((i) => i.id)).toContain(robeId);
    expect(profile?.deliveryZones).toEqual(['Cocody', 'Yopougon']);
    expect(profile?.tone).toBe('ivoirien');
  });

  it('bumps rev on update', async () => {
    const owner = await seedOwner(testDb.db);
    const before = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [owner.shopId]);
    await testDb.db.query(`UPDATE shops SET name = 'X' WHERE id = $1`, [owner.shopId]);
    const after = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [owner.shopId]);
    expect(after.rows[0]!.rev).toBeGreaterThan(before.rows[0]!.rev);
  });
});
