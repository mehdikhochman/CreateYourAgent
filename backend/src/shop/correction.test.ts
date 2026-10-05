import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { seedDemoProfile, seedOwner } from '../test/seed';
import { call, seedConversation, seedMessage, shopApp } from './testing';

const testDb = useTestDb();

const at = (minute: number) => new Date(Date.UTC(2026, 9, 5, 9, minute));

describe('POST /v1/messages/:id/correction', () => {
  it('learns the customer’s latest question before the corrected reply', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, owner.shopId);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    const msg = (role: 'customer' | 'assistant' | 'owner', text: string, minute: number) =>
      seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role, text, at: at(minute) });
    await msg('customer', 'Bonjour', 0);
    await msg('assistant', 'Bonjour ! Que puis-je faire pour vous ?', 1);
    await msg('customer', 'La robe wax fait combien ?', 2);
    await msg('owner', 'Je regarde', 3);
    const replyId = await msg('assistant', 'Je préviens le responsable.', 4);
    await msg('customer', 'Ok merci', 5);

    const res = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'price', productId: robeId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      question: 'La robe wax fait combien ?',
      action: 'price',
      productId: robeId,
      answer: '',
      source: 'correction',
      deleted: false,
    });
    const row = (await testDb.db.query('SELECT * FROM learned_answers WHERE id = $1', [res.body.id])).rows[0];
    expect(row).toMatchObject({
      shop_id: owner.shopId,
      from_message_id: replyId,
      question_norm: 'la robe wax fait combien',
    });
  });

  it('breaks a created_at tie with rev', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: 'Vous livrez ?', at: at(0) });
    const replyId = await seedMessage(testDb.db, {
      shopId: owner.shopId,
      conversationId,
      role: 'assistant',
      text: '…',
      at: at(0),
    });
    const res = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'delivery' });
    expect(res.status).toBe(201);
    expect(res.body.question).toBe('Vous livrez ?');
  });

  it('updates the earlier correction of the same reply instead of adding one', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: 'Wifi ?', at: at(0) });
    const replyId = await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'assistant', text: '?', at: at(1) });

    const first = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'handoff' });
    const second = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'custom', answer: 'Pas de wifi.' });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ id: first.body.id, action: 'custom', answer: 'Pas de wifi.', source: 'correction' });
    const count = await testDb.db.query('SELECT count(*)::int AS n FROM learned_answers WHERE shop_id = $1', [owner.shopId]);
    expect(count.rows[0].n).toBe(1);

    // Once that correction is deleted, a new one is created.
    await call(app, owner, 'DELETE', `/shop/answers/${first.body.id}`);
    const third = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'handoff' });
    expect(third.status).toBe(201);
    expect(third.body.id).not.toBe(first.body.id);
  });

  it('fails with 422 when no customer message comes before the reply', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    const replyId = await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'assistant', text: 'Hello', at: at(1) });
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: 'Après', at: at(2) });

    const res = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'catalog' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('no_question');
  });

  it('fails with 422 when the customer’s message has no text (audio, sticker…)', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: '', at: at(0) });
    const replyId = await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'assistant', text: '?', at: at(1) });
    const res = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'catalog' });
    expect(res.status).toBe(422);
  });

  it('only accepts assistant replies of this shop', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    const conv = await seedConversation(testDb.db, a.shopId);
    const questionId = await seedMessage(testDb.db, { shopId: a.shopId, conversationId: conv.conversationId, role: 'customer', text: 'Prix ?', at: at(0) });
    const replyId = await seedMessage(testDb.db, { shopId: a.shopId, conversationId: conv.conversationId, role: 'assistant', text: '…', at: at(1) });

    for (const [owner, id] of [
      [b, replyId],
      [a, questionId],
      [a, randomUUID()],
    ] as const) {
      const res = await call(app, owner, 'POST', `/messages/${id}/correction`, { action: 'catalog' });
      expect(res.status).toBe(404);
    }
    const count = await testDb.db.query('SELECT count(*)::int AS n FROM learned_answers');
    expect(count.rows[0].n).toBe(0);
  });

  it('validates the action like PUT /shop/answers', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId);
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: 'Le sac ?', at: at(0) });
    const replyId = await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'assistant', text: '?', at: at(1) });

    const price = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'price', productId: randomUUID() });
    expect(price.body.error.code).toBe('invalid_product');
    const custom = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'custom' });
    expect(custom.body.error.code).toBe('answer_required');
    const bad = await call(app, owner, 'POST', `/messages/${replyId}/correction`, { action: 'nope' });
    expect(bad.status).toBe(400);
  });
});
