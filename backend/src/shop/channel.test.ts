import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { seedChannel, seedOwner } from '../test/seed';
import { call, shopApp } from './testing';

const testDb = useTestDb();

async function shopRev(shopId: string): Promise<number> {
  const res = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [shopId]);
  return res.rows[0]!.rev;
}

describe('/v1/channels/whatsapp', () => {
  it('reports no number before linking', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'GET', '/channels/whatsapp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: false, phoneNumberId: null, displayPhone: null });
  });

  it('links a test number, and the profile re-syncs as connected', async () => {
    const { app, deps } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const before = await shopRev(owner.shopId);

    const res = await call(app, owner, 'PUT', '/channels/whatsapp', { phoneNumberId: '106540352242922', displayPhone: '+1 555 0100' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connected: true, phoneNumberId: '106540352242922', displayPhone: '+1 555 0100' });
    expect(await call(app, owner, 'GET', '/channels/whatsapp')).toMatchObject({ body: res.body });

    const after = await shopRev(owner.shopId);
    expect(after).toBeGreaterThan(before);
    const shop = await call(app, owner, 'GET', '/shop');
    expect(shop.body.profile.whatsapp).toEqual({ connected: true, displayPhone: '+1 555 0100' });
    const sync = await call(app, owner, 'GET', `/sync?cursor=${before}`);
    expect(sync.body.profile).toMatchObject({ rev: after, whatsapp: { connected: true } });

    const row = (await testDb.db.query('SELECT * FROM channels WHERE shop_id = $1', [owner.shopId])).rows[0];
    expect(row.connected_at).toEqual(deps.clock.now());
  });

  it('replaces the shop’s number (one per shop) and reconnects it', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    await seedChannel(testDb.db, owner.shopId, '1111111');
    await testDb.db.query(`UPDATE channels SET status = 'disconnected' WHERE shop_id = $1`, [owner.shopId]);

    const res = await call(app, owner, 'PUT', '/channels/whatsapp', { phoneNumberId: '2222222' });
    expect(res.body).toEqual({ connected: true, phoneNumberId: '2222222', displayPhone: '' });
    const rows = await testDb.db.query('SELECT phone_number_id FROM channels WHERE shop_id = $1', [owner.shopId]);
    expect(rows.rows).toEqual([{ phone_number_id: '2222222' }]);

    // Same number again: fine (retry).
    expect((await call(app, owner, 'PUT', '/channels/whatsapp', { phoneNumberId: '2222222' })).status).toBe(200);
  });

  it('refuses a number linked to another shop', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    await seedChannel(testDb.db, a.shopId, '1234567890');
    const before = await shopRev(b.shopId);

    const res = await call(app, b, 'PUT', '/channels/whatsapp', { phoneNumberId: '1234567890', displayPhone: '+1' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('number_taken');
    expect((await call(app, b, 'GET', '/channels/whatsapp')).body.connected).toBe(false);
    expect((await call(app, a, 'GET', '/channels/whatsapp')).body.phoneNumberId).toBe('1234567890');
    expect(await shopRev(b.shopId)).toBe(before);
  });

  it('unlinks the number and bumps the profile rev', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    await seedChannel(testDb.db, a.shopId, '1111111');
    await seedChannel(testDb.db, b.shopId, '2222222');
    const before = await shopRev(a.shopId);

    expect((await call(app, a, 'DELETE', '/channels/whatsapp')).status).toBe(204);
    expect((await call(app, a, 'GET', '/channels/whatsapp')).body).toEqual({
      connected: false,
      phoneNumberId: null,
      displayPhone: null,
    });
    const after = await shopRev(a.shopId);
    expect(after).toBeGreaterThan(before);
    expect((await call(app, a, 'GET', '/shop')).body.profile.whatsapp).toEqual({ connected: false, displayPhone: null });

    // Retrying changes nothing; the other shop keeps its number.
    expect((await call(app, a, 'DELETE', '/channels/whatsapp')).status).toBe(204);
    expect(await shopRev(a.shopId)).toBe(after);
    expect((await call(app, b, 'GET', '/channels/whatsapp')).body.connected).toBe(true);

    // The freed number can now be linked by someone else.
    expect((await call(app, b, 'PUT', '/channels/whatsapp', { phoneNumberId: '1111111' })).status).toBe(200);
  });

  it.each([
    ['missing id', { displayPhone: '+1' }],
    ['letters', { phoneNumberId: '12345abc' }],
    ['too short', { phoneNumberId: '1234' }],
    ['too long', { phoneNumberId: '1'.repeat(31) }],
    ['number as JSON number', { phoneNumberId: 1234567 }],
    ['display phone too long', { phoneNumberId: '1234567', displayPhone: '1'.repeat(31) }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    expect((await call(app, owner, 'PUT', '/channels/whatsapp', body)).status).toBe(400);
  });
});
