import { beforeEach, describe, expect, it } from 'vitest';

import { useTestDb } from '../test/db';
import { makeTestDeps, type TestDeps } from '../test/fakes';
import { seedChannel, seedOwner } from '../test/seed';
import { FIXTURE_OUTBOUND_WAMID, metaFixture, type MetaFixtureName } from './fixtures';
import { ingestEvents } from './ingest';
import { type InboundEvent, parseMetaWebhook } from './parse';

const testDb = useTestDb();
const NOW = new Date('2026-10-05T10:00:00.000Z');

let deps: TestDeps;
let shopId: string;

beforeEach(async () => {
  deps = makeTestDeps(testDb.db);
  deps.clock.set(NOW);
  shopId = (await seedOwner(testDb.db)).shopId;
  await seedChannel(testDb.db, shopId);
});

const events = (name: MetaFixtureName) => parseMetaWebhook(metaFixture(name).body);
const ingest = (name: MetaFixtureName) => ingestEvents(deps, events(name));

async function conversation() {
  const res = await testDb.db.query(
    `SELECT c.*, cu.wa_id, cu.display_name FROM conversations c JOIN customers cu ON cu.id = c.customer_id`,
  );
  expect(res.rows).toHaveLength(1);
  return res.rows[0];
}

async function messages() {
  return (await testDb.db.query('SELECT * FROM messages ORDER BY created_at, wamid')).rows;
}

/** An outbound message (assistant reply) the status fixtures point to. */
async function seedOutbound(status: string, opts: { shop?: string; wamid?: string } = {}) {
  await ingest('text');
  const conv = await conversation();
  await testDb.db.query(
    `INSERT INTO messages (shop_id, conversation_id, role, text, wamid, status) VALUES ($1, $2, 'assistant', 'Bonjour', $3, $4)`,
    [opts.shop ?? shopId, conv.id, opts.wamid ?? FIXTURE_OUTBOUND_WAMID, status],
  );
}

async function outboundStatus(wamid = FIXTURE_OUTBOUND_WAMID) {
  return (await testDb.db.query('SELECT status, error FROM messages WHERE wamid = $1', [wamid])).rows[0];
}

describe('ingestEvents: customer messages', () => {
  it('creates customer, conversation and message, and queues one debounced reply', async () => {
    expect(await ingest('text')).toEqual({ inserted: 1 });

    const conv = await conversation();
    expect(conv).toMatchObject({
      shop_id: shopId,
      wa_id: '2250748123390',
      display_name: 'Fatou',
      last_message_at: NOW,
      last_customer_message_at: new Date('2026-10-05T09:59:58Z'),
      unread_count: 1,
      ai_paused_until: null,
    });
    const [msg] = await messages();
    expect(msg).toMatchObject({
      shop_id: shopId,
      conversation_id: conv.id,
      role: 'customer',
      kind: 'text',
      text: 'Bonsoir, le sac est à combien ?',
      wamid: 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABIYFjNFQjBDMUQ4RTk0QTY1NDdCMDlCAA==',
      status: 'received',
      created_at: NOW,
    });
    expect(deps.jobs.jobs).toEqual([
      {
        kind: 'reply',
        key: `reply:${conv.id}`,
        payload: { conversationId: conv.id },
        runAt: new Date(NOW.getTime() + 4_000),
      },
    ]);
    // Queued in the message's own transaction.
    expect(deps.jobs.inTransaction).toEqual([true]);
  });

  it('rolls the message back when its reply job cannot be queued, so Meta\'s retry gets answered', async () => {
    const realEnqueue = deps.jobs.enqueue.bind(deps.jobs);
    deps.jobs.enqueue = async () => {
      throw new Error('queue down');
    };
    await expect(ingest('text')).rejects.toThrow('queue down');
    expect(await messages()).toHaveLength(0);

    deps.jobs.enqueue = realEnqueue;
    expect(await ingest('text')).toEqual({ inserted: 1 });
    expect(deps.jobs.jobs).toHaveLength(1);
  });

  it('ignores a webhook Meta sends again (same wamid)', async () => {
    await ingest('text');
    deps.clock.advance(30_000);
    expect(await ingest('text')).toEqual({ inserted: 0 });
    expect(await messages()).toHaveLength(1);
    expect(deps.jobs.jobs).toHaveLength(1);
    expect(await conversation()).toMatchObject({ unread_count: 1, last_message_at: NOW });
  });

  it('stores a burst and queues the reply under one key', async () => {
    expect(await ingest('burst')).toEqual({ inserted: 2 });
    const conv = await conversation();
    expect((await messages()).map((m) => m.text)).toEqual(['Bonjour', 'svp prix sac']);
    expect(conv.unread_count).toBe(2);
    expect(conv.last_customer_message_at).toEqual(new Date('2026-10-05T09:59:58Z'));
    expect(deps.jobs.jobs.map((j) => j.key)).toEqual([`reply:${conv.id}`, `reply:${conv.id}`]);
  });

  it('pushes the reply back with the latest message', async () => {
    await ingest('text');
    deps.clock.advance(2_000);
    await ingest('audio');
    expect(deps.jobs.jobs.map((j) => j.runAt)).toEqual([
      new Date(NOW.getTime() + 4_000),
      new Date(NOW.getTime() + 6_000),
    ]);
    expect((await messages()).map((m) => m.kind)).toEqual(['text', 'audio']);
  });

  it('still queues the reply while the owner has taken over', async () => {
    await ingest('text');
    await testDb.db.query('UPDATE conversations SET ai_paused_until = $1', [new Date(NOW.getTime() + 3_600_000)]);
    await ingest('image');
    expect(deps.jobs.jobs).toHaveLength(2);
  });

  it('skips events for an unknown or disconnected number', async () => {
    const foreign = events('text').map((e) => ({ ...e, phoneNumberId: '999' }));
    expect(await ingestEvents(deps, foreign)).toEqual({ inserted: 0 });
    await testDb.db.query(`UPDATE channels SET status = 'disconnected'`);
    expect(await ingest('text')).toEqual({ inserted: 0 });

    expect((await testDb.db.query('SELECT 1 FROM customers')).rowCount).toBe(0);
    expect(deps.jobs.jobs).toEqual([]);
    expect(deps.log.lines.filter((l) => l.level === 'warn')).toHaveLength(2);
  });

  it('updates the customer name only when WhatsApp sends a new non-empty one', async () => {
    await ingest('text');
    const rename = (name: string, wamid: string) =>
      ingestEvents(
        deps,
        events('text').map((e) => ({ ...e, wamid, profileName: name }) as InboundEvent),
      );
    await rename('', 'w2');
    expect((await conversation()).display_name).toBe('Fatou');
    await rename('Fatou K.', 'w3');
    expect((await conversation()).display_name).toBe('Fatou K.');
  });

  it('never moves the 24-hour window into the future or backwards', async () => {
    const future = events('text').map((e) => ({ ...e, timestamp: new Date(NOW.getTime() + 3_600_000) }));
    await ingestEvents(deps, future as InboundEvent[]);
    expect((await conversation()).last_customer_message_at).toEqual(NOW);

    const late = events('text').map((e) => ({ ...e, wamid: 'w-late', timestamp: new Date('2026-10-05T08:00:00Z') }));
    await ingestEvents(deps, late as InboundEvent[]);
    expect((await conversation()).last_customer_message_at).toEqual(NOW);

    const noTs = events('text').map((e) => ({ ...e, wamid: 'w-nots', timestamp: null }));
    deps.clock.advance(60_000);
    await ingestEvents(deps, noTs as InboundEvent[]);
    expect((await conversation()).last_customer_message_at).toEqual(new Date(NOW.getTime() + 60_000));
  });

  it('keeps the same customer apart between two shops', async () => {
    const other = await seedOwner(testDb.db);
    await seedChannel(testDb.db, other.shopId, '555');
    await ingest('text');
    const second = events('text').map((e) => ({ ...e, phoneNumberId: '555', wamid: 'w-other-shop' }));
    await ingestEvents(deps, second);
    const rows = (await testDb.db.query('SELECT shop_id FROM conversations ORDER BY shop_id')).rows;
    expect(rows.map((r) => r.shop_id).sort()).toEqual([shopId, other.shopId].sort());
  });
});

describe('ingestEvents: echoes (owner replied from WhatsApp Business)', () => {
  it('stores an owner message and pauses the AI for takeover_minutes', async () => {
    await testDb.db.query('UPDATE shops SET takeover_minutes = 30 WHERE id = $1', [shopId]);
    await ingest('text');
    deps.clock.advance(5_000);
    expect(await ingest('echo')).toEqual({ inserted: 1 });

    const later = new Date(NOW.getTime() + 5_000);
    const conv = await conversation();
    expect(conv.ai_paused_until).toEqual(new Date(later.getTime() + 30 * 60_000));
    expect(conv.last_message_at).toEqual(later);
    expect(conv.unread_count).toBe(1);
    const owner = (await messages()).find((m) => m.role === 'owner');
    expect(owner).toMatchObject({
      kind: 'text',
      text: "Oui ma sœur, il reste en rouge. Je vous l'envoie demain.",
      status: 'sent',
      created_at: later,
    });
    expect(deps.jobs.jobs).toHaveLength(1); // only the customer's message
  });

  it('creates the conversation when the owner writes first', async () => {
    await ingest('echo');
    const conv = await conversation();
    expect(conv).toMatchObject({ wa_id: '2250748123390', display_name: '', last_customer_message_at: null });
    expect(conv.ai_paused_until).toEqual(new Date(NOW.getTime() + 120 * 60_000));
  });

  it('ignores the echo of a message we already stored (sent through the API) and retries', async () => {
    await seedOutbound('sent', { wamid: (events('echo')[0] as { wamid: string }).wamid });
    expect(await ingest('echo')).toEqual({ inserted: 0 });
    expect((await conversation()).ai_paused_until).toBeNull();
    expect((await messages()).filter((m) => m.role === 'owner')).toEqual([]);
  });
});

describe('ingestEvents: statuses', () => {
  it('moves forward only', async () => {
    await seedOutbound('queued');
    await ingest('status-sent');
    expect((await outboundStatus()).status).toBe('sent');
    await ingest('status-read');
    expect((await outboundStatus()).status).toBe('read');
    await ingest('status-delivered'); // arrives late: ignored
    expect((await outboundStatus()).status).toBe('read');
    await ingest('status-failed');
    expect(await outboundStatus()).toEqual({ status: 'read', error: null });
  });

  it('marks a sent message failed with the error', async () => {
    await seedOutbound('sent');
    expect(await ingest('status-failed')).toEqual({ inserted: 0 });
    const row = await outboundStatus();
    expect(row.status).toBe('failed');
    expect(row.error).toMatch(/^131047 Re-engagement message: Message failed to send because more than 24 hours/);
  });

  it('does not fail a delivered message', async () => {
    await seedOutbound('delivered');
    await ingest('status-failed');
    expect((await outboundStatus()).status).toBe('delivered');
  });

  it('ignores unknown wamids', async () => {
    await expect(ingest('status-read')).resolves.toEqual({ inserted: 0 });
  });

  it("never touches another shop's message", async () => {
    // The wamid belongs to shop B; the status arrives on shop A's number.
    const other = await seedOwner(testDb.db);
    await seedChannel(testDb.db, other.shopId, '555');
    await ingestEvents(deps, events('text').map((e) => ({ ...e, phoneNumberId: '555' })));
    const convB = (await testDb.db.query('SELECT id FROM conversations WHERE shop_id = $1', [other.shopId])).rows[0];
    await testDb.db.query(
      `INSERT INTO messages (shop_id, conversation_id, role, text, wamid, status) VALUES ($1, $2, 'assistant', 'x', $3, 'sent')`,
      [other.shopId, convB.id, FIXTURE_OUTBOUND_WAMID],
    );
    await ingest('status-read');
    await ingest('status-failed');
    expect(await outboundStatus()).toEqual({ status: 'sent', error: null });
  });
});
