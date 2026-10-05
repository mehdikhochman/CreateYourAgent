import { randomUUID } from 'node:crypto';

import type { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { signAccessToken } from '../auth/tokens';
import { useTestDb } from '../test/db';
import { TEST_JWT_SECRET } from '../test/fakes';
import { seedOwner, type SeededOwner } from '../test/seed';
import type { SyncPage } from './sync';
import { call, seedConversation, seedMessage, shopApp } from './testing';

const testDb = useTestDb();

const KINDS = ['catalog', 'answers', 'conversations', 'messages', 'alerts'] as const;

/** Fills a shop with rows in every synced table; returns the ids per kind. */
async function seedShopData(shopId: string) {
  const db = testDb.db;
  const ids: Record<(typeof KINDS)[number], string[]> = {
    catalog: [],
    answers: [],
    conversations: [],
    messages: [],
    alerts: [],
  };
  for (let i = 0; i < 25; i++) {
    const id = randomUUID();
    await db.query('INSERT INTO catalog_items (id, shop_id, name, price_fcfa, position) VALUES ($1, $2, $3, $4, $5)', [
      id,
      shopId,
      `Article ${i}`,
      1000 + i,
      i,
    ]);
    ids.catalog.push(id);
  }
  for (let i = 0; i < 8; i++) {
    const id = randomUUID();
    await db.query(
      `INSERT INTO learned_answers (id, shop_id, question, question_norm, action, source)
       VALUES ($1, $2, $3, $3, 'catalog', 'manual')`,
      [id, shopId, `question ${i}`],
    );
    ids.answers.push(id);
  }
  for (let c = 0; c < 4; c++) {
    const { conversationId } = await seedConversation(db, shopId, { name: `Client ${c}` });
    ids.conversations.push(conversationId);
    let lastMessageId = '';
    for (let m = 0; m < 5; m++) {
      lastMessageId = await seedMessage(db, {
        shopId,
        conversationId,
        role: m % 2 === 0 ? 'customer' : 'assistant',
        text: `Message ${c}.${m}`,
      });
      ids.messages.push(lastMessageId);
    }
    if (c < 3) {
      const alert = await db.query<{ id: string }>(
        `INSERT INTO alerts (shop_id, conversation_id, message_id, kind, summary)
         VALUES ($1, $2, $3, 'order', 'Veut commander') RETURNING id`,
        [shopId, conversationId, lastMessageId],
      );
      ids.alerts.push(alert.rows[0]!.id);
    }
  }
  return ids;
}

/** Pages through /sync from `cursor` and returns every page. */
async function syncAll(app: Hono, owner: SeededOwner, cursor: number, limit: number): Promise<SyncPage[]> {
  const pages: SyncPage[] = [];
  for (;;) {
    const res = await call(app, owner, 'GET', `/sync?cursor=${cursor}&limit=${limit}`);
    expect(res.status).toBe(200);
    const page = res.body as SyncPage;
    pages.push(page);
    cursor = page.cursor;
    if (!page.hasMore) return pages;
    expect(pages.length).toBeLessThan(100);
  }
}

function rowsOf(page: SyncPage) {
  return [
    ...(page.profile ? [{ kind: 'profile', id: page.profile.shopId, rev: page.profile.rev }] : []),
    ...KINDS.flatMap((kind) => page[kind].map((r: { id: string; rev: number }) => ({ kind, id: r.id, rev: r.rev }))),
  ];
}

describe('GET /v1/sync', () => {
  it('pages through every row of the shop exactly once, and nothing of other shops', async () => {
    const { app } = shopApp(testDb.db);
    const a = await seedOwner(testDb.db);
    const b = await seedOwner(testDb.db);
    const aIds = await seedShopData(a.shopId);
    const bIds = await seedShopData(b.shopId);
    const total = 1 + KINDS.reduce((n, k) => n + aIds[k].length, 0); // 1 profile + 60 rows

    const pages = await syncAll(app, a, 0, 7);
    expect(pages).toHaveLength(Math.ceil(total / 7));
    let previous = 0;
    for (const page of pages) {
      const rows = rowsOf(page);
      expect(rows.length).toBeLessThanOrEqual(7);
      for (const row of rows) expect(row.rev).toBeGreaterThan(previous);
      const maxRev = Math.max(...rows.map((r) => r.rev));
      expect(page.cursor).toBe(maxRev);
      previous = page.cursor;
    }
    expect(pages.at(-1)!.hasMore).toBe(false);
    expect(pages.slice(0, -1).every((p) => p.hasMore)).toBe(true);

    const seen = pages.flatMap(rowsOf);
    expect(seen).toHaveLength(total);
    expect(seen.filter((r) => r.kind === 'profile').map((r) => r.id)).toEqual([a.shopId]);
    for (const kind of KINDS) {
      expect(seen.filter((r) => r.kind === kind).map((r) => r.id).sort()).toEqual([...aIds[kind]].sort());
    }
    const bAll = new Set([b.shopId, ...KINDS.flatMap((k) => bIds[k])]);
    expect(seen.some((r) => bAll.has(r.id))).toBe(false);

    // Nothing new: same cursor back, empty page.
    const last = pages.at(-1)!.cursor;
    const empty = await call(app, a, 'GET', `/sync?cursor=${last}`);
    expect(empty.body).toEqual({
      cursor: last,
      hasMore: false,
      profile: null,
      catalog: [],
      answers: [],
      conversations: [],
      messages: [],
      alerts: [],
    });
  });

  it('returns updated and deleted rows again with a higher rev', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const ids = await seedShopData(owner.shopId);
    const first = await syncAll(app, owner, 0, 500);
    expect(first).toHaveLength(1);
    const cursor = first[0]!.cursor;

    const itemId = ids.catalog[3]!;
    const answerId = ids.answers[2]!;
    const messageId = ids.messages[1]!;
    const alertId = ids.alerts[0]!;
    await call(app, owner, 'PUT', `/shop/catalog/${itemId}`, { name: 'Nouveau nom', priceFcfa: 5 });
    await call(app, owner, 'DELETE', `/shop/catalog/${ids.catalog[4]!}`);
    await call(app, owner, 'DELETE', `/shop/answers/${answerId}`);
    await call(app, owner, 'PATCH', '/shop', { hours: '8h–18h' });
    await testDb.db.query(`UPDATE messages SET status = 'read' WHERE id = $1`, [messageId]);
    await testDb.db.query(`UPDATE alerts SET status = 'done' WHERE id = $1`, [alertId]);
    await testDb.db.query(`UPDATE conversations SET unread_count = 3 WHERE id = $1`, [ids.conversations[1]!]);

    const res = await call(app, owner, 'GET', `/sync?cursor=${cursor}`);
    const page = res.body as SyncPage;
    expect(page.hasMore).toBe(false);
    expect(page.profile).toMatchObject({ hours: '8h–18h' });
    expect(page.catalog).toEqual([
      expect.objectContaining({ id: itemId, name: 'Nouveau nom', deleted: false }),
      expect.objectContaining({ id: ids.catalog[4], deleted: true }),
    ]);
    expect(page.answers).toEqual([expect.objectContaining({ id: answerId, deleted: true })]);
    expect(page.messages).toEqual([expect.objectContaining({ id: messageId, status: 'read' })]);
    expect(page.alerts).toEqual([expect.objectContaining({ id: alertId, status: 'done' })]);
    expect(page.conversations).toEqual([expect.objectContaining({ id: ids.conversations[1], unreadCount: 3 })]);
    for (const row of rowsOf(page)) expect(row.rev).toBeGreaterThan(cursor);
  });

  it('uses the shared DTO mappers', async () => {
    const { app, deps } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const lastCustomerMessageAt = new Date(deps.clock.now().getTime() - 60 * 60 * 1000);
    const { conversationId } = await seedConversation(testDb.db, owner.shopId, {
      waId: '2250701020304',
      name: 'Fatou',
      lastCustomerMessageAt,
    });
    await seedMessage(testDb.db, { shopId: owner.shopId, conversationId, role: 'customer', text: 'Bonjour', at: lastCustomerMessageAt });
    const messageId = await seedMessage(testDb.db, {
      shopId: owner.shopId,
      conversationId,
      role: 'assistant',
      text: 'Bonjour Fatou !',
      at: new Date(lastCustomerMessageAt.getTime() + 1000),
    });

    const page = (await call(app, owner, 'GET', '/sync')).body as SyncPage;
    expect(page.profile).toMatchObject({ shopId: owner.shopId, whatsapp: { connected: false, displayPhone: null } });
    expect(page.conversations).toEqual([
      expect.objectContaining({
        id: conversationId,
        customer: { name: 'Fatou', phone: '+2250701020304' },
        lastMessagePreview: 'Bonjour Fatou !',
        aiPausedUntil: null,
        canReply: true,
      }),
    ]);
    expect(page.messages.at(-1)).toEqual({
      id: messageId,
      conversationId,
      role: 'assistant',
      kind: 'text',
      text: 'Bonjour Fatou !',
      status: 'received',
      clientId: null,
      error: null,
      createdAt: new Date(lastCustomerMessageAt.getTime() + 1000).toISOString(),
      rev: expect.any(Number),
    });

    // canReply follows the clock: a day later the 24 h window is closed.
    deps.clock.advance(24 * 60 * 60 * 1000);
    const later = (await call(app, await withFreshToken(owner, deps.clock.now()), 'GET', '/sync')).body as SyncPage;
    expect(later.conversations[0]!.canReply).toBe(false);
  });

  it('defaults to cursor 0 and 200 rows per page', async () => {
    const { app } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    await testDb.db.query(
      `INSERT INTO catalog_items (id, shop_id, name) SELECT gen_random_uuid(), $1, 'x' FROM generate_series(1, 250)`,
      [owner.shopId],
    );
    const first = (await call(app, owner, 'GET', '/sync')).body as SyncPage;
    expect(first.profile).not.toBeNull();
    expect(first.catalog).toHaveLength(199);
    expect(first.hasMore).toBe(true);
    const second = (await call(app, owner, 'GET', `/sync?cursor=${first.cursor}`)).body as SyncPage;
    expect(second.profile).toBeNull();
    expect(second.catalog).toHaveLength(51);
    expect(second.hasMore).toBe(false);
  });

  it.each(['cursor=-1', 'cursor=abc', 'cursor=1.5', 'limit=0', 'limit=501', 'limit=ten'])(
    'rejects %s with 400',
    async (query) => {
      const { app } = shopApp(testDb.db);
      const owner = await seedOwner(testDb.db);
      expect((await call(app, owner, 'GET', `/sync?${query}`)).status).toBe(400);
    },
  );
});

/** Same owner with an access token signed at `now`. */
async function withFreshToken(owner: SeededOwner, now: Date): Promise<SeededOwner> {
  const token = await signAccessToken(
    TEST_JWT_SECRET,
    { ownerId: owner.ownerId, shopId: owner.shopId, sessionId: owner.sessionId },
    now,
  );
  return { ...owner, token, headers: { Authorization: `Bearer ${token}` } };
}
