import { describe, expect, it } from 'vitest';

import { FakeAssistant } from '../test/fakes';
import { useTestDb } from '../test/db';
import { seedDemoProfile, seedOwner } from '../test/seed';
import { DailyCounter, TEST_CHAT_DAILY_LIMIT } from './assistant-test';
import { call, shopApp } from './testing';

const testDb = useTestDb();

const ask = (text: string) => ({ messages: [{ role: 'customer', text }] });

describe('POST /v1/assistant/test', () => {
  it('sends the profile, the earlier turns and the last message to the assistant', async () => {
    const { app, deps } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const { robeId } = await seedDemoProfile(testDb.db, owner.shopId);

    const res = await call(app, owner, 'POST', '/assistant/test', {
      messages: [
        { role: 'customer', text: 'Bonjour' },
        { role: 'assistant', text: 'Bonjour ! Comment puis-je vous aider ?' },
        { role: 'customer', text: ' La robe fait combien ? ' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      reply: { text: 'Bonjour ! Comment puis-je vous aider ?', confident: true },
      meta: { action: 'greet', source: 'model' },
    });

    expect(deps.assistant.calls).toHaveLength(1);
    const input = deps.assistant.calls[0]!;
    expect(input.profile.shopId).toBe(owner.shopId);
    expect(input.profile.catalog.map((i) => i.id)).toContain(robeId);
    expect(input.history).toEqual([
      { role: 'customer', text: 'Bonjour' },
      { role: 'assistant', text: 'Bonjour ! Comment puis-je vous aider ?' },
    ]);
    expect(input.message).toBe('La robe fait combien ?');
  });

  it('returns the alert of a reply that needs the owner', async () => {
    const assistant = new FakeAssistant(() => ({
      reply: { text: 'Je préviens le responsable.', confident: false, alert: { kind: 'question', summary: 'Prix de gros' } },
      meta: { action: 'handoff', source: 'learned' },
    }));
    const { app } = shopApp(testDb.db, { assistant });
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'POST', '/assistant/test', ask('Prix de gros ?'));
    expect(res.body).toEqual({
      reply: { text: 'Je préviens le responsable.', confident: false, alert: { kind: 'question', summary: 'Prix de gros' } },
      meta: { action: 'handoff', source: 'learned' },
    });
  });

  it.each([
    ['no messages', { messages: [] }],
    ['last message from the assistant', { messages: [{ role: 'customer', text: 'a' }, { role: 'assistant', text: 'b' }] }],
    ['owner role', { messages: [{ role: 'owner', text: 'a' }] }],
    ['empty text', { messages: [{ role: 'customer', text: '  ' }] }],
    ['text too long', { messages: [{ role: 'customer', text: 'a'.repeat(1001) }] }],
    ['more than 20 messages', { messages: Array.from({ length: 21 }, () => ({ role: 'customer', text: 'a' })) }],
  ])('rejects %s with 400', async (_label, body) => {
    const { app, deps } = shopApp(testDb.db);
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'POST', '/assistant/test', body);
    expect(res.status).toBe(400);
    expect(deps.assistant.calls).toHaveLength(0);
  });

  it(`allows ${TEST_CHAT_DAILY_LIMIT} tests per shop per UTC day`, async () => {
    const { app, deps } = shopApp(testDb.db);
    deps.clock.set('2026-10-05T23:30:00Z');
    const a = await seedOwner(testDb.db, { now: deps.clock.now() });
    const b = await seedOwner(testDb.db, { now: deps.clock.now() });

    for (let i = 0; i < TEST_CHAT_DAILY_LIMIT; i++) {
      expect((await call(app, a, 'POST', '/assistant/test', ask(`Question ${i}`))).status).toBe(200);
    }
    const over = await call(app, a, 'POST', '/assistant/test', ask('Encore'));
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('test_limit');
    expect(deps.assistant.calls).toHaveLength(TEST_CHAT_DAILY_LIMIT);

    // Another shop has its own count.
    expect((await call(app, b, 'POST', '/assistant/test', ask('Salut'))).status).toBe(200);

    // A new UTC day starts a new count (the tokens are valid until 00:30).
    deps.clock.set('2026-10-06T00:00:01Z');
    expect((await call(app, a, 'POST', '/assistant/test', ask('Demain'))).status).toBe(200);
  });

  it('answers 502 when the assistant fails', async () => {
    const assistant = new FakeAssistant(() => {
      throw new Error('boom');
    });
    const { app, deps } = shopApp(testDb.db, { assistant });
    const owner = await seedOwner(testDb.db);
    const res = await call(app, owner, 'POST', '/assistant/test', ask('Bonjour'));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('assistant_failed');
    expect(deps.log.lines.some((l) => l.level === 'error')).toBe(true);
  });
});

describe('DailyCounter', () => {
  it('counts per key and resets when the UTC day changes', () => {
    const counter = new DailyCounter(2);
    const day1 = new Date('2026-10-05T23:59:59Z');
    expect([counter.take('a', day1), counter.take('a', day1), counter.take('a', day1)]).toEqual([true, true, false]);
    expect(counter.take('b', day1)).toBe(true);
    expect(counter.take('a', new Date('2026-10-06T00:00:00Z'))).toBe(true);
  });
});
