import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { makeTestDeps } from '../test/fakes';
import { conversationJobHandlers } from './jobs';
import { ownerSendJobHandler } from './owner-send-job';
import { addMessage, at, seedConversation, seedShop } from './testing';

const testDb = useTestDb();

const ctx = (attempt = 1, maxAttempts = 5) => ({ jobId: 1, attempt, maxAttempts });

async function setup(status = 'queued') {
  const deps = makeTestDeps(testDb.db);
  const owner = await seedShop(testDb.db);
  const conv = await seedConversation(testDb.db, owner.shopId);
  const messageId = await addMessage(testDb.db, {
    shopId: owner.shopId,
    conversationId: conv.conversationId,
    role: 'owner',
    text: 'Je vous livre à 15 h',
    status,
    clientId: randomUUID(),
    createdAt: at(-1000),
  });
  const run = (attempt = 1, maxAttempts = 5) => ownerSendJobHandler(deps)({ messageId }, ctx(attempt, maxAttempts));
  return { deps, owner, conv, messageId, run };
}

async function message(id: string) {
  return (await testDb.db.query('SELECT status, wamid, error FROM messages WHERE id = $1', [id])).rows[0];
}

describe('send_owner_message job', () => {
  it('is registered with the reply job', () => {
    const handlers = conversationJobHandlers(makeTestDeps(testDb.db));
    expect(Object.keys(handlers).sort()).toEqual(['reply', 'send_owner_message']);
  });

  it('sends the owner’s message to the customer and marks it sent', async () => {
    const { deps, owner, conv, messageId, run } = await setup();
    await run();
    expect(deps.whatsapp.sent).toEqual([
      { phoneNumberId: `pnid-${owner.shopId.slice(0, 8)}`, to: conv.waId, text: 'Je vous livre à 15 h', wamid: 'wamid.out.1' },
    ]);
    expect(await message(messageId)).toEqual({ status: 'sent', wamid: 'wamid.out.1', error: null });

    // Run again (duplicate job): not sent twice.
    await run();
    expect(deps.whatsapp.sent).toHaveLength(1);
  });

  it.each(['sent', 'delivered', 'read', 'failed'])('does nothing for a message already %s', async (status) => {
    const { deps, run } = await setup(status);
    await run();
    expect(deps.whatsapp.sent).toEqual([]);
  });

  it('retries on errors, then marks the message failed on the last attempt', async () => {
    const { deps, messageId, run } = await setup();
    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1, 3)).rejects.toThrow('Meta is down');
    expect(await message(messageId)).toMatchObject({ status: 'queued' });
    await expect(run(3, 3)).resolves.toBeUndefined();
    expect(await message(messageId)).toEqual({ status: 'failed', wamid: null, error: 'Meta is down' });
  });

  it('fails at once outside the 24-hour window, with a message for the owner', async () => {
    const { deps, messageId, run } = await setup();
    deps.whatsapp.failWith = Object.assign(new Error('Re-engagement message'), { metaCode: 131047 });
    await run(1);
    expect(await message(messageId)).toMatchObject({ status: 'failed', error: 'Plus de 24 h : le client doit réécrire' });
  });

  it('fails when the shop has no connected WhatsApp number', async () => {
    const { deps, owner, messageId, run } = await setup();
    await testDb.db.query('DELETE FROM channels WHERE shop_id = $1', [owner.shopId]);
    await run();
    expect(deps.whatsapp.sent).toEqual([]);
    expect(await message(messageId)).toMatchObject({ status: 'failed', error: 'WhatsApp n’est pas connecté' });
  });

  it('retries later while another worker is sending the same message', async () => {
    const { deps, messageId, run } = await setup();
    const other = await testDb.db.connect();
    try {
      await other.query('SELECT pg_advisory_lock(hashtext($1))', [`send_owner_message:${messageId}`]);
      await expect(run()).rejects.toThrow('being sent by another worker');
      expect(deps.whatsapp.sent).toEqual([]);
    } finally {
      await other.query('SELECT pg_advisory_unlock_all()');
      other.release();
    }
    await run(2);
    expect(deps.whatsapp.sent).toHaveLength(1);
  });

  it('ignores missing messages, non-owner messages and bad payloads', async () => {
    const { deps, owner, conv } = await setup();
    const customerMsg = await addMessage(testDb.db, {
      shopId: owner.shopId,
      conversationId: conv.conversationId,
      role: 'customer',
      text: 'Bonjour',
      createdAt: at(-500),
    });
    const handler = ownerSendJobHandler(deps);
    await handler({ messageId: randomUUID() }, ctx());
    await handler({ messageId: customerMsg }, ctx());
    await handler({ messageId: 42 }, ctx());
    expect(deps.whatsapp.sent).toEqual([]);
    expect(deps.log.lines.map((l) => l.msg)).toEqual([
      'owner send: message not found',
      'owner send: message not found',
      'owner send: invalid payload',
    ]);
  });
});
