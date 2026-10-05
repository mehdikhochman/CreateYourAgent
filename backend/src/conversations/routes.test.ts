import { randomUUID } from 'node:crypto';

import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../http/build-app';
import { useTestDb } from '../test/db';
import { makeTestDeps, type TestDeps } from '../test/fakes';
import type { SeededOwner } from '../test/seed';
import { conversationRoutes } from './routes';
import { addMessage, at, seedConversation, seedShop } from './testing';

const testDb = useTestDb();

function makeApp(): { app: Hono; deps: TestDeps } {
  const deps = makeTestDeps(testDb.db);
  return { app: buildApp(deps, { authed: [conversationRoutes(deps)] }), deps };
}

async function call(app: Hono, owner: SeededOwner, method: string, path: string, body?: unknown) {
  const res = await app.request(`/v1${path}`, {
    method,
    headers: { ...owner.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function openAlert(shopId: string, conversationId: string, kind = 'question', summary = 'Demande un prix') {
  const res = await testDb.db.query<{ id: string }>(
    `INSERT INTO alerts (shop_id, conversation_id, kind, summary) VALUES ($1, $2, $3, $4) RETURNING id`,
    [shopId, conversationId, kind, summary],
  );
  return res.rows[0]!.id;
}

describe('GET /v1/conversations', () => {
  it('lists the shop’s conversations, newest first, with their open alerts', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const old = await seedConversation(testDb.db, owner.shopId, { name: 'Koffi', lastMessageAt: at(-3 * 86_400_000) });
    const recent = await seedConversation(testDb.db, owner.shopId, {
      name: 'Fatou',
      waId: '2250701020304',
      lastMessageAt: at(-60_000),
      aiPausedUntil: at(30 * 60_000),
      needsAttention: true,
      unreadCount: 2,
    });
    await seedConversation(testDb.db, other.shopId, { lastMessageAt: at(-1000) });
    await addMessage(testDb.db, { shopId: owner.shopId, conversationId: recent.conversationId, role: 'customer', text: 'Bonjour', createdAt: at(-120_000) });
    await addMessage(testDb.db, { shopId: owner.shopId, conversationId: recent.conversationId, role: 'customer', text: 'prix sac ?', createdAt: at(-60_000) });
    const alertId = await openAlert(owner.shopId, recent.conversationId, 'order', 'Veut commander : Sac cuir');
    const doneAlert = await openAlert(owner.shopId, old.conversationId);
    await testDb.db.query(`UPDATE alerts SET status = 'done' WHERE id = $1`, [doneAlert]);
    await openAlert(other.shopId, (await seedConversation(testDb.db, other.shopId)).conversationId);

    const res = await call(app, owner, 'GET', '/conversations');
    expect(res.status).toBe(200);
    expect(res.body.conversations).toEqual([
      {
        id: recent.conversationId,
        customer: { name: 'Fatou', phone: '+2250701020304' },
        lastMessageAt: at(-60_000).toISOString(),
        lastMessagePreview: 'prix sac ?',
        aiPausedUntil: at(30 * 60_000).toISOString(),
        needsAttention: true,
        unreadCount: 2,
        canReply: true,
        rev: expect.any(Number),
      },
      expect.objectContaining({ id: old.conversationId, canReply: false, aiPausedUntil: null, lastMessagePreview: '' }),
    ]);
    expect(res.body.alerts).toEqual([
      {
        id: alertId,
        conversationId: recent.conversationId,
        kind: 'order',
        summary: 'Veut commander : Sac cuir',
        status: 'open',
        createdAt: expect.any(String),
        rev: expect.any(Number),
      },
    ]);
    expect(res.body.nextBefore).toBeNull();
  });

  it('filters the conversations that need attention', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const flagged = await seedConversation(testDb.db, owner.shopId, { needsAttention: true, lastMessageAt: at(-5000) });
    await seedConversation(testDb.db, owner.shopId, { lastMessageAt: at(-1000) });
    const res = await call(app, owner, 'GET', '/conversations?filter=attention');
    expect(res.body.conversations.map((c: { id: string }) => c.id)).toEqual([flagged.conversationId]);
  });

  it('pages with `before` without skipping conversations that share a timestamp', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    // Times: -1, -2, -3, -3, -3, -4, -5 minutes.
    const minutes = [1, 2, 3, 3, 3, 4, 5];
    const ids: string[] = [];
    for (const m of minutes) {
      ids.push((await seedConversation(testDb.db, owner.shopId, { lastMessageAt: at(-m * 60_000) })).conversationId);
    }
    const seen: string[] = [];
    let before: string | null = null;
    let pages = 0;
    do {
      const query: string = `/conversations?limit=3${before ? `&before=${encodeURIComponent(before)}` : ''}`;
      const res = await call(app, owner, 'GET', query);
      expect(res.status).toBe(200);
      seen.push(...res.body.conversations.map((c: { id: string }) => c.id));
      before = res.body.nextBefore;
      pages += 1;
    } while (before && pages < 10);
    expect(seen).toHaveLength(7);
    expect(new Set(seen)).toEqual(new Set(ids));
    expect(seen[0]).toBe(ids[0]);
    expect(seen.at(-1)).toBe(ids[6]);
  });

  it('validates the query and requires a token', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    expect((await call(app, owner, 'GET', '/conversations?limit=0')).status).toBe(400);
    expect((await call(app, owner, 'GET', '/conversations?limit=51')).status).toBe(400);
    expect((await call(app, owner, 'GET', '/conversations?filter=nope')).status).toBe(400);
    expect((await call(app, owner, 'GET', '/conversations?before=hier')).status).toBe(400);
    expect((await app.request('/v1/conversations')).status).toBe(401);
  });
});

describe('GET /v1/conversations/:id/messages', () => {
  it('returns a page oldest first, and older pages with `before`', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId);
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      ids.push(
        await addMessage(testDb.db, {
          shopId: owner.shopId,
          conversationId: conv.conversationId,
          role: i % 2 ? 'assistant' : 'customer',
          text: `m${i}`,
          createdAt: at(-60_000 + i * 1000),
        }),
      );
    }

    const first = await call(app, owner, 'GET', `/conversations/${conv.conversationId}/messages?limit=3`);
    expect(first.status).toBe(200);
    expect(first.body.messages.map((m: { text: string }) => m.text)).toEqual(['m2', 'm3', 'm4']);
    expect(first.body.messages[0]).toEqual({
      id: ids[2],
      conversationId: conv.conversationId,
      role: 'customer',
      kind: 'text',
      text: 'm2',
      status: 'received',
      clientId: null,
      error: null,
      createdAt: at(-58_000).toISOString(),
      rev: expect.any(Number),
    });
    expect(first.body.nextBefore).toEqual(expect.any(String));

    const second = await call(
      app,
      owner,
      'GET',
      `/conversations/${conv.conversationId}/messages?limit=3&before=${encodeURIComponent(first.body.nextBefore)}`,
    );
    expect(second.body.messages.map((m: { text: string }) => m.text)).toEqual(['m0', 'm1']);
    expect(second.body.nextBefore).toBeNull();
  });

  it('is 404 for another shop’s conversation or a bad id', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const theirs = await seedConversation(testDb.db, other.shopId);
    await addMessage(testDb.db, { shopId: other.shopId, conversationId: theirs.conversationId, role: 'customer', text: 'secret', createdAt: at(-1000) });
    expect((await call(app, owner, 'GET', `/conversations/${theirs.conversationId}/messages`)).status).toBe(404);
    expect((await call(app, owner, 'GET', '/conversations/nope/messages')).status).toBe(404);
  });
});

describe('POST /v1/conversations/:id/messages', () => {
  it('stores the owner’s message, pauses the assistant and queues the send', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    await testDb.db.query('UPDATE shops SET takeover_minutes = 30 WHERE id = $1', [owner.shopId]);
    const conv = await seedConversation(testDb.db, owner.shopId, { lastCustomerMessageAt: at(-23 * 3_600_000) });
    const clientId = randomUUID();

    const res = await call(app, owner, 'POST', `/conversations/${conv.conversationId}/messages`, {
      clientId,
      text: '  Je vous livre à 15 h  ',
    });
    expect(res.status).toBe(201);
    expect(res.body.message).toEqual({
      id: expect.any(String),
      conversationId: conv.conversationId,
      role: 'owner',
      kind: 'text',
      text: 'Je vous livre à 15 h',
      status: 'queued',
      clientId,
      error: null,
      createdAt: deps.clock.now().toISOString(),
      rev: expect.any(Number),
    });
    expect(res.body.conversation).toMatchObject({
      id: conv.conversationId,
      aiPausedUntil: at(30 * 60_000).toISOString(),
      lastMessageAt: deps.clock.now().toISOString(),
      lastMessagePreview: 'Je vous livre à 15 h',
    });
    const messageId = res.body.message.id;
    expect(deps.jobs.jobs).toEqual([
      { kind: 'send_owner_message', key: `send_owner_message:${messageId}`, payload: { messageId } },
    ]);
    expect(deps.jobs.inTransaction).toEqual([true]);
    const row = (await testDb.db.query('SELECT shop_id, role FROM messages WHERE id = $1', [messageId])).rows[0];
    expect(row).toEqual({ shop_id: owner.shopId, role: 'owner' });
  });

  it('is idempotent on clientId', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId);
    const body = { clientId: randomUUID(), text: 'Bonjour' };
    const path = `/conversations/${conv.conversationId}/messages`;

    const first = await call(app, owner, 'POST', path, body);
    const again = await call(app, owner, 'POST', path, { ...body, clientId: body.clientId.toUpperCase() });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.message).toEqual(first.body.message);
    const count = await testDb.db.query('SELECT count(*)::int AS n FROM messages WHERE conversation_id = $1', [conv.conversationId]);
    expect(count.rows[0].n).toBe(1);
    // Still queued: queued again under the same key (the real queue merges them).
    expect(deps.jobs.jobs.map((j) => j.key)).toEqual([
      `send_owner_message:${first.body.message.id}`,
      `send_owner_message:${first.body.message.id}`,
    ]);

    // Once sent, a retry doesn't queue anything.
    await testDb.db.query(`UPDATE messages SET status = 'sent' WHERE id = $1`, [first.body.message.id]);
    const late = await call(app, owner, 'POST', path, body);
    expect(late.status).toBe(200);
    expect(late.body.message.status).toBe('sent');
    expect(deps.jobs.jobs).toHaveLength(2);
  });

  it('refuses a clientId already used by another shop or conversation', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const mine = await seedConversation(testDb.db, owner.shopId);
    const mine2 = await seedConversation(testDb.db, owner.shopId);
    const theirs = await seedConversation(testDb.db, other.shopId);
    const clientId = randomUUID();
    expect((await call(app, other, 'POST', `/conversations/${theirs.conversationId}/messages`, { clientId, text: 'a' })).status).toBe(201);

    const res = await call(app, owner, 'POST', `/conversations/${mine.conversationId}/messages`, { clientId, text: 'b' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('client_id_conflict');
    expect(JSON.stringify(res.body)).not.toContain(theirs.conversationId);

    const own = randomUUID();
    expect((await call(app, owner, 'POST', `/conversations/${mine.conversationId}/messages`, { clientId: own, text: 'c' })).status).toBe(201);
    expect((await call(app, owner, 'POST', `/conversations/${mine2.conversationId}/messages`, { clientId: own, text: 'c' })).status).toBe(409);
  });

  it('refuses to reply more than 24 hours after the customer’s last message', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    const stale = await seedConversation(testDb.db, owner.shopId, { lastCustomerMessageAt: at(-24 * 3_600_000) });
    const never = await seedConversation(testDb.db, owner.shopId, { lastCustomerMessageAt: null });
    for (const conv of [stale, never]) {
      const res = await call(app, owner, 'POST', `/conversations/${conv.conversationId}/messages`, {
        clientId: randomUUID(),
        text: 'Bonjour',
      });
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        code: 'outside_reply_window',
        message: 'Plus de 24 h depuis le dernier message du client : il doit vous réécrire',
      });
    }
    expect(deps.jobs.jobs).toEqual([]);
    expect((await testDb.db.query(`SELECT 1 FROM messages`)).rowCount).toBe(0);
  });

  it('is 404 for another shop’s conversation and 400 for a bad body', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const theirs = await seedConversation(testDb.db, other.shopId);
    const mine = await seedConversation(testDb.db, owner.shopId);
    const path = `/conversations/${mine.conversationId}/messages`;
    expect((await call(app, owner, 'POST', `/conversations/${theirs.conversationId}/messages`, { clientId: randomUUID(), text: 'x' })).status).toBe(404);
    expect((await call(app, owner, 'POST', path, { clientId: randomUUID(), text: '   ' })).status).toBe(400);
    expect((await call(app, owner, 'POST', path, { clientId: randomUUID(), text: 'x'.repeat(4097) })).status).toBe(400);
    expect((await call(app, owner, 'POST', path, { clientId: 'abc', text: 'x' })).status).toBe(400);
    expect((await call(app, owner, 'POST', path, { text: 'x' })).status).toBe(400);
  });
});

describe('takeover, release, read', () => {
  it('pauses the assistant for the shop’s takeover time, then gives it back', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId);

    const taken = await call(app, owner, 'POST', `/conversations/${conv.conversationId}/takeover`);
    expect(taken.status).toBe(200);
    expect(taken.body.conversation.aiPausedUntil).toBe(at(120 * 60_000).toISOString());

    const released = await call(app, owner, 'POST', `/conversations/${conv.conversationId}/release`);
    expect(released.status).toBe(200);
    expect(released.body.conversation.aiPausedUntil).toBeNull();
    const row = (await testDb.db.query('SELECT ai_paused_until FROM conversations WHERE id = $1', [conv.conversationId])).rows[0];
    expect(row.ai_paused_until).toBeNull();
    expect(deps.jobs.jobs).toEqual([]);
  });

  it('marks the conversation and its alert as read', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId, { unreadCount: 3, needsAttention: true });
    const alertId = await openAlert(owner.shopId, conv.conversationId);

    const res = await call(app, owner, 'POST', `/conversations/${conv.conversationId}/read`);
    expect(res.status).toBe(200);
    expect(res.body.conversation).toMatchObject({ unreadCount: 0, needsAttention: true });
    const alert = (await testDb.db.query('SELECT seen_at, status FROM alerts WHERE id = $1', [alertId])).rows[0];
    expect(alert).toEqual({ seen_at: deps.clock.now(), status: 'open' });
  });

  it('is 404 for another shop’s conversation and changes nothing there', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const theirs = await seedConversation(testDb.db, other.shopId, { unreadCount: 2, aiPausedUntil: at(60_000) });
    for (const action of ['takeover', 'release', 'read']) {
      expect((await call(app, owner, 'POST', `/conversations/${theirs.conversationId}/${action}`)).status).toBe(404);
    }
    const row = (await testDb.db.query('SELECT unread_count, ai_paused_until FROM conversations WHERE id = $1', [theirs.conversationId])).rows[0];
    expect(row).toEqual({ unread_count: 2, ai_paused_until: at(60_000) });
  });
});

describe('POST /v1/alerts/:id/done', () => {
  it('closes the alert and clears needs_attention', async () => {
    const { app, deps } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId, { needsAttention: true });
    const alertId = await openAlert(owner.shopId, conv.conversationId, 'order', 'Veut commander');

    const res = await call(app, owner, 'POST', `/alerts/${alertId}/done`);
    expect(res.status).toBe(200);
    expect(res.body.alert).toMatchObject({ id: alertId, status: 'done', kind: 'order' });
    expect(res.body.conversation).toMatchObject({ id: conv.conversationId, needsAttention: false });
    const row = (await testDb.db.query('SELECT resolved_at FROM alerts WHERE id = $1', [alertId])).rows[0];
    expect(row.resolved_at).toEqual(deps.clock.now());

    // Done again: same answer.
    const again = await call(app, owner, 'POST', `/alerts/${alertId}/done`);
    expect(again.status).toBe(200);
    expect(again.body.alert.status).toBe('done');
  });

  it('keeps needs_attention while another alert is open on the conversation', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const conv = await seedConversation(testDb.db, owner.shopId, { needsAttention: true });
    const first = await openAlert(owner.shopId, conv.conversationId);
    await testDb.db.query(`UPDATE alerts SET status = 'done' WHERE id = $1`, [first]);
    await openAlert(owner.shopId, conv.conversationId, 'order', 'Nouvelle commande');

    // An old alert marked done again (e.g. an app retry) doesn't hide the new one.
    const res = await call(app, owner, 'POST', `/alerts/${first}/done`);
    expect(res.status).toBe(200);
    expect(res.body.conversation.needsAttention).toBe(true);
  });

  it('is 404 for another shop’s alert', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    const other = await seedShop(testDb.db);
    const theirs = await seedConversation(testDb.db, other.shopId, { needsAttention: true });
    const alertId = await openAlert(other.shopId, theirs.conversationId);
    expect((await call(app, owner, 'POST', `/alerts/${alertId}/done`)).status).toBe(404);
    expect((await call(app, owner, 'POST', `/alerts/${randomUUID()}/done`)).status).toBe(404);
    const row = (await testDb.db.query('SELECT status FROM alerts WHERE id = $1', [alertId])).rows[0];
    expect(row.status).toBe('open');
  });
});

describe('PUT /v1/devices/current', () => {
  async function session(id: string) {
    return (await testDb.db.query('SELECT push_token, platform FROM sessions WHERE id = $1', [id])).rows[0];
  }

  it('saves and clears the push token of the current session', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db, { pushToken: null });
    const res = await call(app, owner, 'PUT', '/devices/current', { pushToken: 'ExponentPushToken[new]', platform: 'android' });
    expect(res.status).toBe(204);
    expect(await session(owner.sessionId)).toEqual({ push_token: 'ExponentPushToken[new]', platform: 'android' });

    expect((await call(app, owner, 'PUT', '/devices/current', { pushToken: null })).status).toBe(204);
    expect(await session(owner.sessionId)).toEqual({ push_token: null, platform: 'android' });
  });

  it('takes the token away from older sessions on the same phone, whoever they belong to', async () => {
    const { app } = makeApp();
    const before = await seedShop(testDb.db, { pushToken: 'ExponentPushToken[shared-phone]' });
    const elsewhere = await seedShop(testDb.db, { pushToken: 'ExponentPushToken[other-phone]' });
    const now = await seedShop(testDb.db, { pushToken: null });

    const res = await call(app, now, 'PUT', '/devices/current', { pushToken: 'ExponentPushToken[shared-phone]' });
    expect(res.status).toBe(204);
    expect(await session(now.sessionId)).toMatchObject({ push_token: 'ExponentPushToken[shared-phone]' });
    expect(await session(before.sessionId)).toMatchObject({ push_token: null });
    expect(await session(elsewhere.sessionId)).toMatchObject({ push_token: 'ExponentPushToken[other-phone]' });
  });

  it('validates the body and refuses a revoked session', async () => {
    const { app } = makeApp();
    const owner = await seedShop(testDb.db);
    expect((await call(app, owner, 'PUT', '/devices/current', { pushToken: 'x'.repeat(201) })).status).toBe(400);
    expect((await call(app, owner, 'PUT', '/devices/current', { pushToken: 'a', platform: 'symbian' })).status).toBe(400);
    expect((await call(app, owner, 'PUT', '/devices/current', {})).status).toBe(400);
    await testDb.db.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1', [owner.sessionId, at(-1000)]);
    expect((await call(app, owner, 'PUT', '/devices/current', { pushToken: 'a' })).status).toBe(401);
  });
});
