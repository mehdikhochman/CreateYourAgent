import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { seedDemoProfile, seedOwner } from '../test/seed';
import { call, shopApp } from './testing';

const testDb = useTestDb();

async function answerRow(id: string) {
  const res = await testDb.db.query('SELECT * FROM learned_answers WHERE id = $1', [id]);
  return res.rows[0];
}

describe('PUT /v1/shop/answers/:id', () => {
  it('creates a manual answer with its normalized question', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const id = randomUUID();
    const res = await call(app, owner, 'PUT', `/shop/answers/${id}`, {
      question: ' Vous êtes ouverts le dimanche ? ',
      action: 'custom',
      answer: 'Non, on se repose le dimanche.',
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id,
      question: 'Vous êtes ouverts le dimanche ?',
      action: 'custom',
      productId: null,
      answer: 'Non, on se repose le dimanche.',
      source: 'manual',
      deleted: false,
      rev: expect.any(Number),
    });
    const row = await answerRow(id);
    expect(row).toMatchObject({ shop_id: owner.shopId, question_norm: 'vous etes ouverts le dimanche' });
  });

  it('updates an answer and keeps its source', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const id = randomUUID();
    await testDb.db.query(
      `INSERT INTO learned_answers (id, shop_id, question, question_norm, action, source)
       VALUES ($1, $2, 'livrez ?', 'livrez', 'delivery', 'correction')`,
      [id, owner.shopId],
    );
    const before = (await answerRow(id)).rev;
    const res = await call(app, owner, 'PUT', `/shop/answers/${id}`, { question: 'Vous livrez à Yop ?', action: 'delivery' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ question: 'Vous livrez à Yop ?', source: 'correction' });
    expect(res.body.rev).toBeGreaterThan(before);
    expect((await answerRow(id)).question_norm).toBe('vous livrez a yop');
  });

  it('needs a live product of this shop for the price action', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const other = await seedOwner(testDb.db);
    const { robeId, sacId } = await seedDemoProfile(testDb.db, owner.shopId);
    const { robeId: otherRobe } = await seedDemoProfile(testDb.db, other.shopId);
    await testDb.db.query('UPDATE catalog_items SET deleted_at = now() WHERE id = $1', [sacId]);
    const put = (productId?: string | null) =>
      call(app, owner, 'PUT', `/shop/answers/${randomUUID()}`, { question: 'la robe ?', action: 'price', productId });

    for (const productId of [undefined, null, randomUUID(), otherRobe, sacId]) {
      const res = await put(productId);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('invalid_product');
    }
    const ok = await put(robeId.toUpperCase());
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ action: 'price', productId: robeId });
  });

  it('needs the owner’s words for the custom action', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    for (const answer of [undefined, '', '   ']) {
      const res = await call(app, owner, 'PUT', `/shop/answers/${randomUUID()}`, { question: 'Wifi ?', action: 'custom', answer });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('answer_required');
    }
  });

  it('keeps productId only for the price action', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, owner.shopId);
    const res = await call(app, owner, 'PUT', `/shop/answers/${randomUUID()}`, {
      question: 'je veux commander',
      action: 'order',
      productId: robeId,
    });
    expect(res.status).toBe(200);
    expect(res.body.productId).toBeNull();
  });

  it.each([
    ['missing question', { action: 'catalog' }],
    ['question too long', { question: 'a'.repeat(301), action: 'catalog' }],
    ['unknown action', { question: 'Bonjour', action: 'greet' }],
    ['product id not a uuid', { question: 'prix', action: 'price', productId: 'robe' }],
    ['answer too long', { question: 'Wifi ?', action: 'custom', answer: 'a'.repeat(1001) }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'PUT', `/shop/answers/${randomUUID()}`, body);
    expect(res.status).toBe(400);
  });

  it('refuses a question without words', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'PUT', `/shop/answers/${randomUUID()}`, { question: '???', action: 'catalog' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_question');
  });

  it('returns 404 for another shop’s answer and leaves it untouched', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    const id = randomUUID();
    await call(app, a, 'PUT', `/shop/answers/${id}`, { question: 'Vous livrez ?', action: 'delivery' });

    const res = await call(app, b, 'PUT', `/shop/answers/${id}`, { question: 'Piraté', action: 'handoff' });
    expect(res.status).toBe(404);
    expect(await answerRow(id)).toMatchObject({ shop_id: a.shopId, question: 'Vous livrez ?', action: 'delivery' });
    expect((await call(app, b, 'DELETE', `/shop/answers/${id}`)).status).toBe(404);
    expect((await answerRow(id)).deleted_at).toBeNull();
  });
});

describe('DELETE /v1/shop/answers/:id', () => {
  it('soft-deletes, hides it from GET /shop, and a PUT revives it', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const id = randomUUID();
    await call(app, owner, 'PUT', `/shop/answers/${id}`, { question: 'Vous livrez ?', action: 'delivery' });

    expect((await call(app, owner, 'DELETE', `/shop/answers/${id}`)).status).toBe(204);
    expect((await call(app, owner, 'DELETE', `/shop/answers/${id}`)).status).toBe(204);
    expect((await answerRow(id)).deleted_at).not.toBeNull();
    expect((await call(app, owner, 'GET', '/shop')).body.answers).toEqual([]);

    const revived = await call(app, owner, 'PUT', `/shop/answers/${id}`, { question: 'Vous livrez ?', action: 'delivery' });
    expect(revived.body.deleted).toBe(false);
    expect((await call(app, owner, 'GET', '/shop')).body.answers).toHaveLength(1);
  });

  it('returns 404 for an unknown id', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    expect((await call(app, owner, 'DELETE', `/shop/answers/${randomUUID()}`)).status).toBe(404);
  });
});
