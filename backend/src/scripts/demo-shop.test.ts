import { describe, expect, it } from 'vitest';

import { loadShopProfile } from '../domain/profile-repo';
import { useTestDb } from '../test/db';
import { seedChannel, seedOwner } from '../test/seed';
import { DEMO_CATALOG, demoItemId, seedDemoShop } from './demo-shop';

const testDb = useTestDb();
const NOW = new Date('2026-10-05T10:00:00.000Z');
const PHONE = '+2250700000000';

async function count(table: string): Promise<number> {
  const res = await testDb.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return res.rows[0]!.n;
}

describe('seedDemoShop', () => {
  it('creates the owner, the demo profile, the catalogue and the WhatsApp link', async () => {
    const r = await seedDemoShop(
      testDb.db,
      { phone: PHONE, phoneNumberId: '123456789012345', displayPhone: '+1 555 0100' },
      NOW,
    );
    expect(r.owner).toBe('created');
    expect(r.shop).toBe('created');
    expect(r.catalog).toEqual({ created: 4, updated: 0, unchanged: 0 });
    expect(r.channel).toEqual({
      phoneNumberId: '123456789012345',
      displayPhone: '+1 555 0100',
      change: 'created',
      movedFrom: null,
    });

    const profile = await loadShopProfile(testDb.db, r.shopId);
    expect(profile).toMatchObject({
      ownerName: 'Awa',
      ownerPhone: PHONE,
      name: 'Awa Fashion',
      category: 'boutique',
      hours: 'Lun–Sam · 9h–20h',
      deliveryFee: '1 500 F à Cocody, 2 000 F ailleurs',
      tiktok: '@awafashion225',
      instagram: '@awa.fashion',
      salesChannels: ['tiktok', 'instagram'],
      serviceModes: ['livraison'],
      deliveryZones: ['Cocody', 'Yopougon'],
      payments: ['Wave', 'Orange Money'],
      tone: 'ivoirien',
    });
    expect(profile!.catalog.map((i) => [i.name, i.priceFcfa])).toEqual([
      ['Robe pagne wax (taille S à XL)', 12000],
      ['Sac à main simili cuir', 8500],
      ['Perruque brésilienne', 25000],
      ['Chaussures dame', 15000],
    ]);

    const channel = await testDb.db.query('SELECT shop_id, status, connected_at FROM channels');
    expect(channel.rows).toEqual([{ shop_id: r.shopId, status: 'connected', connected_at: NOW }]);
  });

  it('changes nothing new when run twice', async () => {
    const input = { phone: PHONE, phoneNumberId: '123456789012345', displayPhone: '+1 555 0100' };
    const first = await seedDemoShop(testDb.db, input, NOW);
    const second = await seedDemoShop(testDb.db, input, new Date(NOW.getTime() + 60_000));

    expect(second.ownerId).toBe(first.ownerId);
    expect(second.shopId).toBe(first.shopId);
    expect(second.owner).toBe('unchanged');
    expect(second.shop).toBe('updated');
    expect(second.catalog).toEqual({ created: 0, updated: 0, unchanged: 4 });
    expect(second.channel?.change).toBe('unchanged');
    expect([await count('owners'), await count('shops'), await count('catalog_items'), await count('channels')]).toEqual(
      [1, 1, 4, 1],
    );
    // Unchanged link keeps its first connection time.
    const ch = await testDb.db.query('SELECT connected_at FROM channels');
    expect(ch.rows[0]).toEqual({ connected_at: NOW });
  });

  it('reuses an owner who already logged in, and resets edited or deleted demo items', async () => {
    const owner = await seedOwner(testDb.db, { phone: PHONE, firstName: '', shopName: 'Ma boutique' });
    const robeId = demoItemId(owner.shopId, 'robe');
    const sacId = demoItemId(owner.shopId, 'sac');
    await seedDemoShop(testDb.db, { phone: PHONE }, NOW);

    // The owner edits the price of one demo item, deletes another and adds their own.
    await testDb.db.query('UPDATE catalog_items SET price_fcfa = 1 WHERE id = $1', [robeId]);
    await testDb.db.query('UPDATE catalog_items SET deleted_at = $2 WHERE id = $1', [sacId, NOW]);
    await testDb.db.query(
      `INSERT INTO catalog_items (id, shop_id, name, price_fcfa, position)
       VALUES (gen_random_uuid(), $1, 'Foulard', 3000, 9)`,
      [owner.shopId],
    );

    const r = await seedDemoShop(testDb.db, { phone: PHONE }, NOW);
    expect(r.ownerId).toBe(owner.ownerId);
    expect(r.shopId).toBe(owner.shopId);
    expect(r.owner).toBe('unchanged');
    expect(r.catalog).toEqual({ created: 0, updated: 2, unchanged: 2 });

    const profile = await loadShopProfile(testDb.db, owner.shopId);
    expect(profile!.name).toBe('Awa Fashion');
    expect(profile!.catalog.map((i) => i.name)).toEqual([...DEMO_CATALOG.map((i) => i.name), 'Foulard']);
    expect(profile!.catalog.find((i) => i.id === robeId)?.priceFcfa).toBe(12000);
  });

  it('names an owner who logged in without a first name', async () => {
    await seedOwner(testDb.db, { phone: PHONE, firstName: '' });
    const r = await seedDemoShop(testDb.db, { phone: PHONE }, NOW);
    expect(r.owner).toBe('updated');
    const res = await testDb.db.query('SELECT first_name FROM owners WHERE id = $1', [r.ownerId]);
    expect(res.rows[0]).toEqual({ first_name: 'Awa' });
  });

  it('moves the WhatsApp number from another shop and bumps that shop so its app re-syncs', async () => {
    const other = await seedOwner(testDb.db, { phone: '+2250500000000', shopName: 'Ancienne démo' });
    await seedChannel(testDb.db, other.shopId, '123456789012345');
    const before = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [other.shopId]);

    const r = await seedDemoShop(testDb.db, { phone: PHONE, phoneNumberId: '123456789012345' }, NOW);
    expect(r.channel).toEqual({
      phoneNumberId: '123456789012345',
      // seedChannel saved this display phone; it is kept when --display-phone is left out.
      displayPhone: '+1 555 0100',
      change: 'created',
      movedFrom: { shopId: other.shopId, shopName: 'Ancienne démo' },
    });

    const channels = await testDb.db.query('SELECT shop_id FROM channels');
    expect(channels.rows).toEqual([{ shop_id: r.shopId }]);
    const after = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [other.shopId]);
    expect(after.rows[0]!.rev).toBeGreaterThan(before.rows[0]!.rev);
  });

  it('switches the shop to a new number and reconnects a disconnected link', async () => {
    const first = await seedDemoShop(testDb.db, { phone: PHONE, phoneNumberId: '111111', displayPhone: '+1 555 0001' }, NOW);
    await testDb.db.query(`UPDATE channels SET status = 'disconnected'`);

    const again = await seedDemoShop(testDb.db, { phone: PHONE, phoneNumberId: '111111' }, NOW);
    expect(again.channel).toMatchObject({ change: 'updated', displayPhone: '+1 555 0001' });

    const moved = await seedDemoShop(testDb.db, { phone: PHONE, phoneNumberId: '222222' }, NOW);
    expect(moved.channel).toMatchObject({ change: 'updated', displayPhone: '', movedFrom: null });
    const res = await testDb.db.query('SELECT shop_id, phone_number_id, status FROM channels');
    expect(res.rows).toEqual([{ shop_id: first.shopId, phone_number_id: '222222', status: 'connected' }]);
  });

  it('leaves the WhatsApp link alone without a phone number id', async () => {
    const first = await seedDemoShop(testDb.db, { phone: PHONE, phoneNumberId: '123456789012345' }, NOW);
    const r = await seedDemoShop(testDb.db, { phone: PHONE }, NOW);
    expect(r.channel).toBeNull();
    const res = await testDb.db.query('SELECT shop_id FROM channels');
    expect(res.rows).toEqual([{ shop_id: first.shopId }]);
  });

  it('derives stable, valid and per-shop item ids', () => {
    const shopA = '0b7c1f9e-3c1d-4a8e-9f00-1234567890ab';
    const shopB = '0b7c1f9e-3c1d-4a8e-9f00-1234567890ac';
    const id = demoItemId(shopA, 'robe');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(demoItemId(shopA, 'robe')).toBe(id);
    expect(demoItemId(shopA, 'sac')).not.toBe(id);
    expect(demoItemId(shopB, 'robe')).not.toBe(id);
  });
});
