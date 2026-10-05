import { beforeEach, describe, expect, it } from 'vitest';

import type { Config } from '../config';
import { buildApp } from '../http/build-app';
import { useTestDb } from '../test/db';
import { makeTestDeps, type TestDeps, testConfig } from '../test/fakes';
import { seedChannel, seedOwner } from '../test/seed';
import { metaFixture, signMetaBody } from './fixtures';
import { metaWebhookRoutes } from './routes';

const testDb = useTestDb();
const SECRET = testConfig().meta.appSecret!;

let deps: TestDeps;

beforeEach(async () => {
  deps = makeTestDeps(testDb.db);
  const owner = await seedOwner(testDb.db);
  await seedChannel(testDb.db, owner.shopId);
});

function app(overrides: Partial<TestDeps> = {}) {
  const d = { ...deps, ...overrides };
  return buildApp(d, { public: [{ path: '/webhooks/meta', router: metaWebhookRoutes(d) }] });
}

function withMeta(meta: Partial<Config['meta']>, nodeEnv: Config['nodeEnv'] = 'test'): Config {
  const base = testConfig();
  return { ...base, nodeEnv, meta: { ...base.meta, ...meta } };
}

function post(raw: string, headers: Record<string, string> = { 'x-hub-signature-256': signMetaBody(raw, SECRET) }) {
  return { method: 'POST', body: raw, headers: { 'content-type': 'application/json', ...headers } };
}

async function errorCode(res: Response): Promise<string> {
  return ((await res.json()) as { error: { code: string } }).error.code;
}

async function webhookEvents() {
  return (await testDb.db.query('SELECT * FROM webhook_events ORDER BY id')).rows;
}

describe('GET /webhooks/meta (verification)', () => {
  it('echoes the challenge for the right token', async () => {
    const res = await app().request(
      '/webhooks/meta?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=1158201444',
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await res.text()).toBe('1158201444');
  });

  it('refuses a wrong token, a wrong mode or a missing configuration', async () => {
    expect((await app().request('/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1')).status).toBe(403);
    expect((await app().request('/webhooks/meta?hub.mode=other&hub.verify_token=test-verify-token')).status).toBe(403);
    const unset = app({ config: withMeta({ verifyToken: undefined }) });
    expect((await unset.request('/webhooks/meta?hub.mode=subscribe&hub.challenge=1')).status).toBe(403);
  });
});

describe('POST /webhooks/meta', () => {
  it('accepts a signed payload and stores it', async () => {
    const { raw, body } = metaFixture('text');
    const res = await app().request('/webhooks/meta', post(raw));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('EVENT_RECEIVED');

    expect((await testDb.db.query('SELECT role, text FROM messages')).rows).toEqual([
      { role: 'customer', text: 'Bonsoir, le sac est à combien ?' },
    ]);
    expect(deps.jobs.jobs).toHaveLength(1);
    const [event] = await webhookEvents();
    expect(event).toMatchObject({ source: 'meta', payload: body, received_at: deps.clock.now(), error: null });
    expect(event.processed_at).toEqual(deps.clock.now());
  });

  it('is idempotent when Meta retries', async () => {
    const { raw } = metaFixture('burst');
    expect((await app().request('/webhooks/meta', post(raw))).status).toBe(200);
    expect((await app().request('/webhooks/meta', post(raw))).status).toBe(200);
    expect((await testDb.db.query('SELECT 1 FROM messages')).rowCount).toBe(2);
    expect(await webhookEvents()).toHaveLength(2);
  });

  it('answers 200 to fields it ignores', async () => {
    const { raw } = metaFixture('unrelated');
    expect((await app().request('/webhooks/meta', post(raw))).status).toBe(200);
    expect((await webhookEvents())[0].processed_at).not.toBeNull();
  });

  it('rejects a bad or missing signature without storing anything', async () => {
    const { raw } = metaFixture('text');
    const bad = await app().request('/webhooks/meta', post(raw, { 'x-hub-signature-256': signMetaBody(raw, 'wrong') }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: { code: 'invalid_signature', message: 'Invalid signature' } });
    expect((await app().request('/webhooks/meta', post(raw, {}))).status).toBe(401);
    expect(await webhookEvents()).toEqual([]);
    expect((await testDb.db.query('SELECT 1 FROM messages')).rowCount).toBe(0);
  });

  it('accepts unsigned payloads with a warning when no app secret is set outside production', async () => {
    const { raw } = metaFixture('text');
    const res = await app({ config: withMeta({ appSecret: undefined }) }).request('/webhooks/meta', post(raw, {}));
    expect(res.status).toBe(200);
    expect(deps.log.lines.some((l) => l.level === 'warn' && l.msg.includes('META_APP_SECRET'))).toBe(true);
    expect((await testDb.db.query('SELECT 1 FROM messages')).rowCount).toBe(1);
  });

  it('refuses everything in production when no app secret is set', async () => {
    const { raw } = metaFixture('text');
    const res = await app({ config: withMeta({ appSecret: undefined }, 'production') }).request(
      '/webhooks/meta',
      post(raw, {}),
    );
    expect(res.status).toBe(503);
    expect(await errorCode(res)).toBe('webhook_not_configured');
    expect(await webhookEvents()).toEqual([]);
  });

  it('answers 400 to a signed body that is not JSON', async () => {
    const res = await app().request('/webhooks/meta', post('{"object":'));
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_json');
  });

  it('answers 500 and keeps the error when ingest fails, so Meta retries', async () => {
    const { raw } = metaFixture('text');
    const failing = app({
      jobs: Object.assign(deps.jobs, {
        enqueue: async () => {
          throw new Error('queue down');
        },
      }),
    });
    const res = await failing.request('/webhooks/meta', post(raw));
    expect(res.status).toBe(500);
    expect(await errorCode(res)).toBe('ingest_failed');
    const [event] = await webhookEvents();
    expect(event).toMatchObject({ error: 'queue down', processed_at: null });
    expect(deps.log.lines.some((l) => l.level === 'error')).toBe(true);
  });

  it('still processes a payload Postgres refuses to keep as jsonb (\\u0000)', async () => {
    const raw = metaFixture('text').raw.replace('le sac est', 'le sac\\u0000 est');
    expect(raw).toContain('\\u0000');
    const res = await app().request('/webhooks/meta', post(raw));
    expect(res.status).toBe(200);
    const stored = (await testDb.db.query('SELECT text FROM messages')).rows;
    expect(stored).toEqual([{ text: 'Bonsoir, le sac est à combien ?' }]);
    expect(await webhookEvents()).toEqual([]);
    expect(deps.log.lines.some((l) => l.level === 'error' && l.msg.includes('could not store'))).toBe(true);
  });

  it('rejects oversized bodies', async () => {
    const raw = JSON.stringify({ object: 'whatsapp_business_account', pad: 'x'.repeat(1024 * 1024) });
    const res = await app().request('/webhooks/meta', post(raw));
    expect(res.status).toBe(413);
  });
});
