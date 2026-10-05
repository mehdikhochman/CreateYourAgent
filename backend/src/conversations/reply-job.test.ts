import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { EngineResult } from '../engine/types';
import type { JobContext } from '../jobs/worker';
import { useTestDb } from '../test/db';
import { FakeAssistant, makeTestDeps } from '../test/fakes';
import { FALLBACK_TEXT, HOLDING_TEXT, replyJobHandler } from './reply-job';
import { addMessage, at, seedConversation, seedShop } from './testing';

const testDb = useTestDb();

const ctx = (attempt = 1, maxAttempts = 5): JobContext => ({ jobId: 1, attempt, maxAttempts });

const orderResult: EngineResult = {
  reply: { text: 'Très bon choix ! Le responsable vous confirme la commande.', confident: true, alert: { kind: 'order', summary: 'Veut commander : Sac cuir' } },
  meta: { action: 'order', source: 'model', model: 'fake' },
};
const questionResult: EngineResult = {
  reply: { text: 'Je demande au responsable.', confident: false, alert: { kind: 'question', summary: 'Demande un prix de gros' } },
  meta: { action: 'handoff', source: 'model', model: 'fake' },
};

async function setup(opts: { assistant?: FakeAssistant; aiPausedUntil?: Date | null } = {}) {
  const deps = makeTestDeps(testDb.db, opts.assistant ? { assistant: opts.assistant } : {});
  const owner = await seedShop(testDb.db);
  const conv = await seedConversation(testDb.db, owner.shopId, { aiPausedUntil: opts.aiPausedUntil ?? null });
  const customer = (text: string, ms: number, extra: { kind?: string } = {}) =>
    addMessage(testDb.db, { shopId: owner.shopId, conversationId: conv.conversationId, role: 'customer', text, createdAt: at(ms), ...extra });
  const run = (attempt = 1, maxAttempts = 5) =>
    replyJobHandler(deps)({ conversationId: conv.conversationId }, ctx(attempt, maxAttempts));
  return { deps, owner, conv, customer, run };
}

async function messages(conversationId: string) {
  const res = await testDb.db.query(
    `SELECT id, role, kind, text, status, wamid, engine, error, created_at FROM messages
      WHERE conversation_id = $1 ORDER BY created_at, id`,
    [conversationId],
  );
  return res.rows;
}

async function assistantMessages(conversationId: string) {
  return (await messages(conversationId)).filter((m) => m.role === 'assistant');
}

async function openAlerts(conversationId: string) {
  const res = await testDb.db.query(`SELECT * FROM alerts WHERE conversation_id = $1 AND status = 'open'`, [conversationId]);
  return res.rows;
}

async function conversation(id: string) {
  return (await testDb.db.query('SELECT * FROM conversations WHERE id = $1', [id])).rows[0];
}

describe('reply job', () => {
  it('answers a customer message on WhatsApp and stores the reply as sent', async () => {
    const { deps, owner, conv, customer, run } = await setup();
    const msgId = await customer('Bonjour', -5000);
    const wamidIn = (await messages(conv.conversationId))[0].wamid;

    await run();

    expect(deps.whatsapp.reads).toEqual([{ phoneNumberId: `pnid-${owner.shopId.slice(0, 8)}`, wamid: wamidIn, typing: true }]);
    expect(deps.whatsapp.sent).toEqual([
      {
        phoneNumberId: `pnid-${owner.shopId.slice(0, 8)}`,
        to: conv.waId,
        text: 'Bonjour ! Comment puis-je vous aider ?',
        wamid: 'wamid.out.1',
      },
    ]);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({
      kind: 'text',
      text: 'Bonjour ! Comment puis-je vous aider ?',
      status: 'sent',
      wamid: 'wamid.out.1',
      error: null,
      created_at: deps.clock.now(),
      engine: { action: 'greet', source: 'model', model: 'fake', confident: true, alert: null, replyTo: msgId },
    });
    expect((await conversation(conv.conversationId)).last_message_at).toEqual(deps.clock.now());
    expect(await openAlerts(conv.conversationId)).toEqual([]);
    expect(deps.push.sent).toEqual([]);
  });

  it('answers a burst once, with the texts joined and the earlier messages as history', async () => {
    const { deps, owner, conv, customer, run } = await setup();
    const shopId = owner.shopId;
    const conversationId = conv.conversationId;
    // 12 earlier messages, alternating; only the last 10 go to the assistant.
    for (let i = 0; i < 12; i++) {
      await addMessage(testDb.db, {
        shopId,
        conversationId,
        role: i % 2 === 0 ? 'customer' : 'assistant',
        text: `old ${i}`,
        createdAt: at(-100_000 + i * 1000),
      });
    }
    await addMessage(testDb.db, { shopId, conversationId, role: 'customer', kind: 'audio', createdAt: at(-80_000) });
    await addMessage(testDb.db, { shopId, conversationId, role: 'assistant', text: HOLDING_TEXT, createdAt: at(-79_000) });
    // An unsent reply is not history.
    await addMessage(testDb.db, { shopId, conversationId, role: 'assistant', text: 'lost', status: 'failed', createdAt: at(-78_000) });
    await customer('Bonjour', -3000);
    await customer('', -2500, { kind: 'image' });
    await customer('svp', -2000);
    await customer('prix sac', -1000);

    await run();

    expect(deps.assistant.calls).toHaveLength(1);
    const call = deps.assistant.calls[0]!;
    expect(call.message).toBe('Bonjour\nsvp\nprix sac');
    expect(call.profile.name).toBe('Awa Fashion');
    expect(call.history).toHaveLength(10);
    expect(call.history[0]).toEqual({ role: 'customer', text: 'old 4' });
    expect(call.history.slice(-3)).toEqual([
      { role: 'assistant', text: 'old 11' },
      { role: 'customer', text: '[note vocale]' },
      { role: 'assistant', text: HOLDING_TEXT },
    ]);
    expect(deps.whatsapp.sent).toHaveLength(1);
  });

  it('does nothing when the burst is already answered (retries and duplicate jobs)', async () => {
    const { deps, customer, run } = await setup();
    await customer('Bonjour', -5000);
    await run();
    await run();
    expect(deps.assistant.calls).toHaveLength(1);
    expect(deps.whatsapp.sent).toHaveLength(1);
  });

  it('does nothing after the owner answered', async () => {
    const { deps, owner, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    await addMessage(testDb.db, { shopId: owner.shopId, conversationId: conv.conversationId, role: 'owner', text: 'Oui ?', createdAt: at(-1000) });
    await run();
    expect(deps.assistant.calls).toHaveLength(0);
    expect(deps.whatsapp.sent).toHaveLength(0);
  });

  it('answers a message that came in while the previous reply was being written', async () => {
    const { deps, conv, customer, run } = await setup();
    const first = await customer('Bonjour', -5000);
    await run(); // reply stored at t = 0
    // Received at -1 s, before that reply was stored, but not part of its burst.
    const second = await customer('Vous livrez à Yopougon ?', -1000);
    deps.clock.advance(5000);
    await run();

    expect(deps.assistant.calls.map((c) => c.message)).toEqual(['Bonjour', 'Vous livrez à Yopougon ?']);
    expect(deps.assistant.calls[1]!.history).toEqual([
      { role: 'customer', text: 'Bonjour' },
      { role: 'assistant', text: 'Bonjour ! Comment puis-je vous aider ?' },
    ]);
    const replies = await assistantMessages(conv.conversationId);
    expect(replies.map((r) => r.engine.replyTo)).toEqual([first, second]);
  });

  it('notifies the owner instead of replying while the AI is paused, and leaves those messages to the owner', async () => {
    const { deps, owner, conv, customer, run } = await setup({ aiPausedUntil: at(60 * 60_000) });
    await customer('Bonjour', -5000);
    await customer('prix sac', -4000);

    await run();

    expect(deps.assistant.calls).toHaveLength(0);
    expect(deps.whatsapp.sent).toHaveLength(0);
    expect(deps.whatsapp.reads).toHaveLength(0);
    expect(deps.push.sent).toEqual([
      {
        to: 'ExponentPushToken[owner-phone]',
        title: 'Fatou',
        body: 'Nouveau message : prix sac',
        data: { conversationId: conv.conversationId, type: 'message' },
      },
    ]);

    // A duplicate job doesn't push again.
    await run();
    expect(deps.push.sent).toHaveLength(1);

    // Once the pause is over, only the new message is answered.
    deps.clock.advance(2 * 60 * 60_000);
    await addMessage(testDb.db, {
      shopId: owner.shopId,
      conversationId: conv.conversationId,
      role: 'customer',
      text: 'Allô ?',
      createdAt: deps.clock.now(),
    });
    deps.clock.advance(5000);
    await run();
    expect(deps.assistant.calls).toHaveLength(1);
    expect(deps.assistant.calls[0]!.message).toBe('Allô ?');
    expect(deps.assistant.calls[0]!.history.map((t) => t.text)).toEqual(['Bonjour', 'prix sac']);
  });

  it('uses the phone number in the push when the customer has no name', async () => {
    const deps = makeTestDeps(testDb.db);
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId, { name: '', waId: '2250701020304', aiPausedUntil: at(60_000) });
    await addMessage(testDb.db, { shopId: owner.shopId, conversationId: conv.conversationId, role: 'customer', kind: 'image', createdAt: at(-1000) });
    await replyJobHandler(deps)({ conversationId: conv.conversationId }, ctx());
    expect(deps.push.sent).toMatchObject([{ title: '+2250701020304', body: 'Nouveau message : [photo]' }]);
  });

  it('sends a holding reply and alerts the owner for voice notes, without calling the assistant', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('', -3000, { kind: 'audio' });
    await customer('', -2000, { kind: 'sticker' });

    await run();

    expect(deps.assistant.calls).toHaveLength(0);
    expect(deps.whatsapp.sent.map((s) => s.text)).toEqual([HOLDING_TEXT]);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({ status: 'sent', engine: { action: 'holding', confident: false } });

    const [alert] = await openAlerts(conv.conversationId);
    expect(alert).toMatchObject({ kind: 'question', summary: 'Note vocale reçue', message_id: reply.id, pushed_at: deps.clock.now() });
    expect((await conversation(conv.conversationId)).needs_attention).toBe(true);
    expect(deps.push.sent).toEqual([
      {
        to: 'ExponentPushToken[owner-phone]',
        title: 'Question',
        body: 'Fatou — Note vocale reçue',
        data: { conversationId: conv.conversationId, alertId: alert.id, type: 'alert' },
      },
    ]);
  });

  it('says « Photo reçue » for photos', async () => {
    const { customer, conv, run } = await setup();
    await customer('', -3000, { kind: 'image' });
    await run();
    expect((await openAlerts(conv.conversationId))[0]).toMatchObject({ summary: 'Photo reçue' });
  });

  it('keeps one open alert per conversation and never turns an order into a question', async () => {
    const results = [orderResult, questionResult];
    const assistant = new FakeAssistant(() => results.shift()!);
    const { deps, conv, customer, run } = await setup({ assistant });

    await customer('je veux payer sac oh', -5000);
    await run();
    const [first] = await openAlerts(conv.conversationId);
    expect(first).toMatchObject({ kind: 'order', summary: 'Veut commander : Sac cuir' });
    expect(deps.push.sent.at(-1)).toMatchObject({ title: 'Commande', body: 'Fatou — Veut commander : Sac cuir' });

    deps.clock.advance(60_000);
    await customer('et en gros ?', 30_000);
    await run();
    const alerts = await openAlerts(conv.conversationId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ id: first.id, kind: 'order', summary: 'Veut commander : Sac cuir' });
    // The owner still hears about the new question.
    expect(deps.push.sent.at(-1)).toMatchObject({ title: 'Question', body: 'Fatou — Demande un prix de gros' });
  });

  it('turns an open question into an order', async () => {
    const results = [questionResult, orderResult];
    const { deps, conv, customer, run } = await setup({ assistant: new FakeAssistant(() => results.shift()!) });
    await customer('en gros ?', -5000);
    await run();
    deps.clock.advance(60_000);
    await customer('ok je prends le sac', 30_000);
    await run();
    const alerts = await openAlerts(conv.conversationId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ kind: 'order', summary: 'Veut commander : Sac cuir', seen_at: null });
  });

  it('alerts with the customer’s words when the engine is unsure without a summary', async () => {
    const assistant = new FakeAssistant(() => ({
      reply: { text: 'Je vérifie.', confident: false },
      meta: { action: 'handoff', source: 'model' },
    }));
    const { conv, customer, run } = await setup({ assistant });
    await customer('Vous faites des retouches ?', -5000);
    await run();
    expect((await openAlerts(conv.conversationId))[0]).toMatchObject({
      kind: 'question',
      summary: 'À vérifier : « Vous faites des retouches ? »',
    });
  });

  it('pushes only to live sessions of this shop’s owner that have a token', async () => {
    const { deps, owner, customer, run } = await setup({ assistant: new FakeAssistant(() => orderResult) });
    const db = testDb.db;
    const insertSession = (ownerId: string, token: string | null, extra: { revoked?: boolean; expired?: boolean } = {}) =>
      db.query(
        `INSERT INTO sessions (owner_id, refresh_hash, push_token, expires_at, revoked_at) VALUES ($1, $2, $3, $4, $5)`,
        [ownerId, randomUUID(), token, extra.expired ? at(-1000) : at(86_400_000), extra.revoked ? at(-1000) : null],
      );
    await insertSession(owner.ownerId, 'ExponentPushToken[tablet]');
    await insertSession(owner.ownerId, 'ExponentPushToken[owner-phone]'); // same device, older session
    await insertSession(owner.ownerId, null);
    await insertSession(owner.ownerId, 'ExponentPushToken[revoked]', { revoked: true });
    await insertSession(owner.ownerId, 'ExponentPushToken[expired]', { expired: true });
    const other = await seedShop(db, { pushToken: 'ExponentPushToken[other-owner]' });
    expect(other.shopId).not.toBe(owner.shopId);

    await customer('je prends le sac', -5000);
    await run();
    expect(deps.push.sent.map((p) => p.to).sort()).toEqual(['ExponentPushToken[owner-phone]', 'ExponentPushToken[tablet]']);
  });

  it('keeps the reply queued when sending fails, and re-sends the same text on retry', async () => {
    let n = 0;
    const assistant = new FakeAssistant(() => ({
      reply: { text: `Réponse ${++n}`, confident: true },
      meta: { action: 'greet', source: 'model' },
    }));
    const { deps, conv, customer, run } = await setup({ assistant });
    await customer('Bonjour', -5000);

    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1)).rejects.toThrow('Meta is down');
    let replies = await assistantMessages(conv.conversationId);
    expect(replies).toMatchObject([{ text: 'Réponse 1', status: 'queued', wamid: null }]);

    deps.whatsapp.failWith = null;
    deps.clock.advance(5000);
    await run(2);
    expect(assistant.calls).toHaveLength(1);
    expect(deps.whatsapp.sent.map((s) => s.text)).toEqual(['Réponse 1']);
    replies = await assistantMessages(conv.conversationId);
    expect(replies).toMatchObject([{ id: replies[0].id, status: 'sent', wamid: 'wamid.out.1' }]);
  });

  it('marks the reply failed and alerts the owner on the last attempt', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1, 2)).rejects.toThrow();
    deps.clock.advance(5000);
    await expect(run(2, 2)).resolves.toBeUndefined();

    expect(deps.assistant.calls).toHaveLength(1);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({ status: 'failed', error: 'Meta is down' });
    const [alert] = await openAlerts(conv.conversationId);
    expect(alert).toMatchObject({ kind: 'question', summary: 'Réponse non envoyée', message_id: reply.id });
    expect((await conversation(conv.conversationId)).needs_attention).toBe(true);
    expect(deps.push.sent).toMatchObject([{ title: 'Question', body: 'Fatou — Réponse non envoyée' }]);

    // A failed reply counts as handled: the next job doesn't answer the same burst again.
    deps.whatsapp.failWith = null;
    await run(1);
    expect(deps.whatsapp.sent).toHaveLength(0);
  });

  it('gives up at once on errors retrying cannot fix', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    deps.whatsapp.failWith = Object.assign(new Error('Recipient not in allowed list'), { metaCode: 131030 });
    await run(1);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({ status: 'failed', error: expect.stringContaining('numéro de test Meta') });
  });

  it('drops a queued reply when the customer wrote again, and answers everything', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1)).rejects.toThrow();
    deps.whatsapp.failWith = null;

    deps.clock.advance(3000);
    await customer('prix sac', 2000);
    deps.clock.advance(4000);
    await run(1); // the new message's job runs before the old retry

    expect(deps.assistant.calls.map((c) => c.message)).toEqual(['Bonjour', 'Bonjour\nprix sac']);
    const replies = await assistantMessages(conv.conversationId);
    expect(replies.map((r) => r.status)).toEqual(['failed', 'sent']);
    expect(replies[0].error).toContain('remplacé');
    expect(deps.whatsapp.sent).toHaveLength(1);

    // The old job's retry finds nothing left to answer.
    await run(2);
    expect(deps.whatsapp.sent).toHaveLength(1);
  });

  it('drops a queued reply when the owner answered before the retry', async () => {
    const { deps, owner, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1)).rejects.toThrow();
    deps.whatsapp.failWith = null;
    await addMessage(testDb.db, {
      shopId: owner.shopId,
      conversationId: conv.conversationId,
      role: 'owner',
      text: 'Bonjour, je suis là',
      createdAt: at(2000),
    });

    deps.clock.advance(5000);
    await run(2);
    expect(deps.whatsapp.sent).toEqual([]);
    expect(deps.assistant.calls).toHaveLength(1);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({ status: 'failed', error: expect.stringContaining('remplacé') });
  });

  it('drops a queued reply when the owner takes over before the retry', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    deps.whatsapp.failWith = new Error('Meta is down');
    await expect(run(1)).rejects.toThrow();
    deps.whatsapp.failWith = null;
    await testDb.db.query('UPDATE conversations SET ai_paused_until = $2 WHERE id = $1', [conv.conversationId, at(60 * 60_000)]);

    deps.clock.advance(5000);
    await run(2);
    expect(deps.whatsapp.sent).toEqual([]);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply).toMatchObject({ status: 'failed', error: 'Non envoyé : vous avez pris la main' });
    expect(deps.push.sent).toMatchObject([{ body: 'Nouveau message : Bonjour' }]);
  });

  it('retries when the assistant fails, and hands over on the last attempt', async () => {
    const assistant = new FakeAssistant(() => {
      throw new Error('Claude timeout');
    });
    const { deps, conv, customer, run } = await setup({ assistant });
    await customer('Bonjour', -5000);
    await expect(run(1, 2)).rejects.toThrow('Claude timeout');
    expect(await assistantMessages(conv.conversationId)).toEqual([]);

    await run(2, 2);
    expect(deps.whatsapp.sent.map((s) => s.text)).toEqual([FALLBACK_TEXT]);
    const [reply] = await assistantMessages(conv.conversationId);
    expect(reply.engine).toMatchObject({ action: 'fallback', error: 'Claude timeout', confident: false });
    expect(await openAlerts(conv.conversationId)).toHaveLength(1);
  });

  it('tries once more before sending the engine\'s own fallback (model outage)', async () => {
    const fallback: EngineResult = {
      reply: { text: FALLBACK_TEXT, confident: false, alert: { kind: 'question', summary: '« Bonjour »' } },
      meta: { action: 'fallback', source: 'fallback', error: 'Claude 529 overloaded' },
    };
    const assistant = new FakeAssistant(() => fallback);
    const { deps, conv, customer, run } = await setup({ assistant });
    await customer('Bonjour', -5000);
    await expect(run(1, 5)).rejects.toThrow('assistant fell back');
    expect(deps.whatsapp.sent).toEqual([]);

    await run(2, 5);
    expect(deps.whatsapp.sent.map((s) => s.text)).toEqual([FALLBACK_TEXT]);
    expect(assistant.calls).toHaveLength(2);
    expect(await openAlerts(conv.conversationId)).toHaveLength(1);
  });

  it('goes on when marking as read fails', async () => {
    const { deps, customer, run } = await setup();
    deps.whatsapp.markRead = async () => {
      throw new Error('read failed');
    };
    await customer('Bonjour', -5000);
    await run();
    expect(deps.whatsapp.sent).toHaveLength(1);
    expect(deps.log.lines).toContainEqual(expect.objectContaining({ msg: 'reply: markRead failed' }));
  });

  it('skips conversations without a connected number, missing conversations and bad payloads', async () => {
    const { deps, owner, customer, run } = await setup();
    await customer('Bonjour', -5000);
    await testDb.db.query(`UPDATE channels SET status = 'disconnected' WHERE shop_id = $1`, [owner.shopId]);
    await run();
    await replyJobHandler(deps)({ conversationId: randomUUID() }, ctx());
    await replyJobHandler(deps)({ conversationId: 'not-a-uuid' }, ctx());
    await replyJobHandler(deps)({}, ctx());
    expect(deps.assistant.calls).toHaveLength(0);
    expect(deps.whatsapp.sent).toHaveLength(0);
    expect(deps.log.lines.map((l) => l.msg)).toEqual([
      'reply: the shop has no connected WhatsApp number',
      'reply: conversation not found',
      'reply: invalid payload',
      'reply: invalid payload',
    ]);
  });

  it('comes back later when another worker is answering the same conversation', async () => {
    const { deps, conv, customer, run } = await setup();
    await customer('Bonjour', -5000);
    const other = await testDb.db.connect();
    try {
      await other.query('SELECT pg_advisory_lock(hashtext($1))', [`reply:${conv.conversationId}`]);
      await run();
      expect(deps.assistant.calls).toHaveLength(0);
      expect(deps.jobs.jobs).toEqual([
        {
          kind: 'reply',
          key: `reply:${conv.conversationId}`,
          payload: { conversationId: conv.conversationId },
          runAt: new Date(deps.clock.now().getTime() + 3000),
        },
      ]);
    } finally {
      await other.query('SELECT pg_advisory_unlock_all()');
      other.release();
    }
    await run();
    expect(deps.whatsapp.sent).toHaveLength(1);
  });
});
