import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { seedDemoProfile, seedOwner } from '../test/seed';
import { MAX_CATALOG_ITEMS } from './catalog';
import { call, shopApp } from './testing';

const testDb = useTestDb();

async function itemRow(id: string) {
  const res = await testDb.db.query('SELECT * FROM catalog_items WHERE id = $1', [id]);
  return res.rows[0];
}

describe('PUT /v1/shop/catalog/:id', () => {
  it('creates an item with the app’s id, appended after the others', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    await seedDemoProfile(testDb.db, owner.shopId); // positions 0 and 1
    const id = randomUUID();

    const res = await call(app, owner, 'PUT', `/shop/catalog/${id}`, { name: ' Garba ', priceFcfa: 1500 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      name: 'Garba',
      priceFcfa: 1500,
      available: true,
      position: 2,
      deleted: false,
      rev: expect.any(Number),
    });
    expect((await itemRow(id)).shop_id).toBe(owner.shopId);
  });

  it('updates an item, keeps its position when none is sent, and bumps its rev', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { sacId } = await seedDemoProfile(testDb.db, owner.shopId);
    const before = (await itemRow(sacId)).rev;

    const res = await call(app, owner, 'PUT', `/shop/catalog/${sacId}`, {
      name: 'Sac cuir',
      priceFcfa: null,
      available: false,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: sacId, name: 'Sac cuir', priceFcfa: null, available: false, position: 1 });
    expect(res.body.rev).toBeGreaterThan(before);

    const moved = await call(app, owner, 'PUT', `/shop/catalog/${sacId}`, { name: 'Sac cuir', priceFcfa: 9000, position: 7 });
    expect(moved.body).toMatchObject({ position: 7, available: true, priceFcfa: 9000 });
  });

  it('is safe to retry', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const id = randomUUID();
    const body = { name: 'Alloco', priceFcfa: 500, position: 0 };
    await call(app, owner, 'PUT', `/shop/catalog/${id}`, body);
    const again = await call(app, owner, 'PUT', `/shop/catalog/${id}`, body);
    expect(again.status).toBe(200);
    const count = await testDb.db.query('SELECT count(*)::int AS n FROM catalog_items WHERE shop_id = $1', [owner.shopId]);
    expect(count.rows[0].n).toBe(1);
  });

  it('returns 404 for an id that belongs to another shop and leaves it untouched', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, a.shopId);

    const res = await call(app, b, 'PUT', `/shop/catalog/${robeId}`, { name: 'Volé', priceFcfa: 1 });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('not_found');
    expect(await itemRow(robeId)).toMatchObject({ shop_id: a.shopId, name: 'Robe pagne wax (taille S à XL)' });
  });

  it('revives a deleted item of this shop', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, owner.shopId);
    await call(app, owner, 'DELETE', `/shop/catalog/${robeId}`);

    const res = await call(app, owner, 'PUT', `/shop/catalog/${robeId}`, { name: 'Robe wax', priceFcfa: 12000 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: false, position: 0 });
    expect((await itemRow(robeId)).deleted_at).toBeNull();
  });

  it(`allows at most ${MAX_CATALOG_ITEMS} live items`, async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    await testDb.db.query(
      `INSERT INTO catalog_items (id, shop_id, name, position)
       SELECT gen_random_uuid(), $1, 'Article ' || i, i FROM generate_series(1, $2::int) AS i`,
      [owner.shopId, MAX_CATALOG_ITEMS],
    );
    const full = await call(app, owner, 'PUT', `/shop/catalog/${randomUUID()}`, { name: 'Un de trop', priceFcfa: 1 });
    expect(full.status).toBe(409);
    expect(full.body.error.code).toBe('catalog_full');

    // Editing an existing item still works when full.
    const some = await testDb.db.query<{ id: string }>('SELECT id FROM catalog_items WHERE shop_id = $1 LIMIT 1', [
      owner.shopId,
    ]);
    const someId = some.rows[0]!.id;
    expect((await call(app, owner, 'PUT', `/shop/catalog/${someId}`, { name: 'Modifié', priceFcfa: 2 })).status).toBe(200);

    // Deleting one frees a slot; reviving it when full again is refused.
    expect((await call(app, owner, 'DELETE', `/shop/catalog/${someId}`)).status).toBe(204);
    expect((await call(app, owner, 'PUT', `/shop/catalog/${randomUUID()}`, { name: 'Nouveau', priceFcfa: 3 })).status).toBe(200);
    const revive = await call(app, owner, 'PUT', `/shop/catalog/${someId}`, { name: 'Modifié', priceFcfa: 2 });
    expect(revive.status).toBe(409);
  });

  it('counts only this shop’s items for the limit', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    await testDb.db.query(
      `INSERT INTO catalog_items (id, shop_id, name) SELECT gen_random_uuid(), $1, 'x' FROM generate_series(1, $2::int)`,
      [a.shopId, MAX_CATALOG_ITEMS],
    );
    expect((await call(app, b, 'PUT', `/shop/catalog/${randomUUID()}`, { name: 'Ok', priceFcfa: 1 })).status).toBe(200);
  });

  it.each([
    ['missing name', { priceFcfa: 100 }],
    ['blank name', { name: '   ', priceFcfa: 100 }],
    ['name too long', { name: 'a'.repeat(121), priceFcfa: 100 }],
    ['missing price', { name: 'Robe' }],
    ['negative price', { name: 'Robe', priceFcfa: -1 }],
    ['decimal price', { name: 'Robe', priceFcfa: 10.5 }],
    ['price too high', { name: 'Robe', priceFcfa: 10_000_001 }],
    ['price as text', { name: 'Robe', priceFcfa: '2 500' }],
    ['negative position', { name: 'Robe', priceFcfa: 1, position: -1 }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'PUT', `/shop/catalog/${randomUUID()}`, body);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an id that is not a uuid', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    expect((await call(app, owner, 'PUT', '/shop/catalog/robe-1', { name: 'Robe', priceFcfa: 1 })).status).toBe(404);
  });
});

describe('DELETE /v1/shop/catalog/:id', () => {
  it('soft-deletes the item at the clock’s time, and a retry changes nothing', async () => {
    const { app, deps } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { robeId, sacId } = await seedDemoProfile(testDb.db, owner.shopId);

    const res = await call(app, owner, 'DELETE', `/shop/catalog/${robeId}`);
    expect(res.status).toBe(204);
    const row = await itemRow(robeId);
    expect(row.deleted_at).toEqual(deps.clock.now());

    const again = await call(app, owner, 'DELETE', `/shop/catalog/${robeId}`);
    expect(again.status).toBe(204);
    expect((await itemRow(robeId)).rev).toBe(row.rev);

    const shop = await call(app, owner, 'GET', '/shop');
    expect(shop.body.catalog.map((i: { id: string }) => i.id)).toEqual([sacId]);
  });

  it('returns 404 for another shop’s item or an unknown id', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, a.shopId);
    expect((await call(app, b, 'DELETE', `/shop/catalog/${robeId}`)).status).toBe(404);
    expect((await itemRow(robeId)).deleted_at).toBeNull();
    expect((await call(app, b, 'DELETE', `/shop/catalog/${randomUUID()}`)).status).toBe(404);
  });
});
