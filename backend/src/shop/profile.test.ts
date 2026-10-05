import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { seedDemoProfile, seedOwner } from '../test/seed';
import { call, shopApp } from './testing';

const testDb = useTestDb();

async function shopRev(shopId: string): Promise<number> {
  const res = await testDb.db.query<{ rev: number }>('SELECT rev FROM shops WHERE id = $1', [shopId]);
  return res.rows[0]!.rev;
}

describe('GET /v1/shop', () => {
  it('returns the profile, the live catalogue by position and the live answers', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db, { firstName: 'Awa' });
    const { robeId, sacId } = await seedDemoProfile(testDb.db, owner.shopId);
    const deletedId = randomUUID();
    await testDb.db.query(
      `INSERT INTO catalog_items (id, shop_id, name, price_fcfa, position, deleted_at)
       VALUES ($1, $2, 'Vieux pagne', 1000, -1, now())`,
      [deletedId, owner.shopId],
    );
    await testDb.db.query(`UPDATE catalog_items SET position = 5 WHERE id = $1`, [robeId]);
    const answerId = randomUUID();
    await testDb.db.query(
      `INSERT INTO learned_answers (id, shop_id, question, question_norm, action, answer, source)
       VALUES ($1, $2, 'Vous livrez ?', 'vous livrez', 'delivery', '', 'manual'),
              ($3, $2, 'Ancienne', 'ancienne', 'custom', 'x', 'manual')`,
      [answerId, owner.shopId, randomUUID()],
    );
    await testDb.db.query(`UPDATE learned_answers SET deleted_at = now() WHERE question = 'Ancienne'`);

    const res = await call(app, owner, 'GET', '/shop');
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      shopId: owner.shopId,
      ownerName: 'Awa',
      ownerPhone: owner.phone,
      category: 'boutique',
      deliveryZones: ['Cocody', 'Yopougon'],
      payments: ['Wave', 'Orange Money'],
      tone: 'ivoirien',
      takeoverMinutes: 120,
      whatsapp: { connected: false, displayPhone: null },
    });
    expect(res.body.catalog.map((i: { id: string }) => i.id)).toEqual([sacId, robeId]);
    expect(res.body.catalog[0]).toEqual({
      id: sacId,
      name: 'Sac à main simili cuir',
      priceFcfa: 8500,
      available: true,
      position: 1,
      deleted: false,
      rev: expect.any(Number),
    });
    expect(res.body.answers).toEqual([
      {
        id: answerId,
        question: 'Vous livrez ?',
        action: 'delivery',
        productId: null,
        answer: '',
        source: 'manual',
        deleted: false,
        rev: expect.any(Number),
      },
    ]);
  });

  it('only shows the caller’s shop', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db, { shopName: 'A' });
    const b = await seedOwner(testDb.db, { shopName: 'B' });
    await seedDemoProfile(testDb.db, a.shopId);
    const res = await call(app, b, 'GET', '/shop');
    expect(res.body.profile.name).toBe('B');
    expect(res.body.catalog).toEqual([]);
  });

  it('requires a token', async () => {
    const { app } = shopApp(testDb.db);
    expect((await app.request('/v1/shop')).status).toBe(401);
  });
});

describe('PATCH /v1/shop', () => {
  it('updates the given fields, the owner name, and bumps the profile rev', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const before = await shopRev(owner.shopId);

    const res = await call(app, owner, 'PATCH', '/shop', {
      ownerName: '  Mariam ',
      category: 'restaurant',
      name: 'Chez Mariam',
      location: 'Cocody Angré, 8e tranche',
      hours: '11h–22h',
      deliveryFee: '1 000 F',
      tiktok: '@chezmariam',
      salesChannels: ['shop', 'whatsapp'],
      serviceModes: ['Sur place', 'Livraison', 'Livraison '],
      deliveryZones: ['Cocody', 'Angré'],
      payments: ['Wave', 'Espèces'],
      tone: 'formel',
      takeoverMinutes: 30,
    });
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({
      ownerName: 'Mariam',
      category: 'restaurant',
      name: 'Chez Mariam',
      location: 'Cocody Angré, 8e tranche',
      hours: '11h–22h',
      deliveryFee: '1 000 F',
      tiktok: '@chezmariam',
      instagram: '',
      salesChannels: ['shop', 'whatsapp'],
      serviceModes: ['Sur place', 'Livraison'],
      deliveryZones: ['Cocody', 'Angré'],
      payments: ['Wave', 'Espèces'],
      tone: 'formel',
      takeoverMinutes: 30,
    });
    expect(res.body.profile.rev).toBeGreaterThan(before);

    const owners = await testDb.db.query('SELECT first_name FROM owners WHERE id = $1', [owner.ownerId]);
    expect(owners.rows[0].first_name).toBe('Mariam');
    expect((await call(app, owner, 'GET', '/shop')).body.profile.name).toBe('Chez Mariam');
  });

  it('leaves fields that are not sent unchanged, and can clear the category', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    await seedDemoProfile(testDb.db, owner.shopId);
    const res = await call(app, owner, 'PATCH', '/shop', { category: null });
    expect(res.status).toBe(200);
    expect(res.body.profile.category).toBeNull();
    expect(res.body.profile.tone).toBe('ivoirien');
    expect(res.body.profile.deliveryZones).toEqual(['Cocody', 'Yopougon']);
  });

  it('bumps the rev when only the owner name changes', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const before = await shopRev(owner.shopId);
    const res = await call(app, owner, 'PATCH', '/shop', { ownerName: 'Koffi' });
    expect(res.body.profile.ownerName).toBe('Koffi');
    expect(await shopRev(owner.shopId)).toBeGreaterThan(before);
  });

  it.each([
    ['empty body', {}],
    ['unknown field', { name: 'X', logo: 'x.png' }],
    ['owner name too long', { ownerName: 'a'.repeat(61) }],
    ['name too long', { name: 'a'.repeat(81) }],
    ['location too long', { location: 'a'.repeat(201) }],
    ['social too long', { instagram: 'a'.repeat(81) }],
    ['bad category', { category: 'garage' }],
    ['unknown sales channel', { salesChannels: ['marché'] }],
    ['duplicate sales channel', { salesChannels: ['shop', 'shop'] }],
    ['unknown zone', { deliveryZones: ['Paris'] }],
    ['duplicate zone', { deliveryZones: ['Cocody', 'Cocody'] }],
    ['too many service modes', { serviceModes: Array.from({ length: 11 }, (_, i) => `mode ${i}`) }],
    ['service mode too long', { serviceModes: ['a'.repeat(41)] }],
    ['too many payments', { payments: Array.from({ length: 11 }, (_, i) => `pay ${i}`) }],
    ['bad tone', { tone: 'drôle' }],
    ['takeover too short', { takeoverMinutes: 4 }],
    ['takeover too long', { takeoverMinutes: 1441 }],
    ['takeover not an integer', { takeoverMinutes: 10.5 }],
    ['wrong type', { name: 42 }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const before = await shopRev(owner.shopId);
    const res = await call(app, owner, 'PATCH', '/shop', body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_request');
    expect(await shopRev(owner.shopId)).toBe(before);
  });

  it('rejects a body that is not JSON', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'PATCH', '/shop', 'not json');
    expect(res.status).toBe(400);
  });

  it('only changes the caller’s shop and owner', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db, { firstName: 'Awa', shopName: 'A' });
    const b = await seedOwner(testDb.db, { firstName: 'Bintou', shopName: 'B' });
    await call(app, b, 'PATCH', '/shop', { name: 'B2', ownerName: 'Bintou2' });
    const res = await call(app, a, 'GET', '/shop');
    expect(res.body.profile).toMatchObject({ name: 'A', ownerName: 'Awa' });
  });
});
