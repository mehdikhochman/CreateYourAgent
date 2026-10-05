import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../http/build-app';
import type { AppEnv } from '../http/env';
import { FakeClock, SilentLogger, testConfig } from './fakes';
import { seedOwner } from './seed';
import { useTestDb } from './db';

const testDb = useTestDb();

describe('buildApp', () => {
  const auth = new Hono();
  auth.post('/otp', (c) => c.json({ ok: 'public' }));
  const shop = new Hono<AppEnv>();
  shop.get('/shop', (c) => c.json({ shopId: c.var.shopId }));
  const app = buildApp(
    { config: testConfig(), clock: new FakeClock(), log: new SilentLogger(), get db() { return testDb.db; } },
    { auth, authed: [shop] },
  );

  it('serves auth routes without a token', async () => {
    const res = await app.request('/v1/auth/otp', { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('rejects authed routes without a token and accepts a valid one', async () => {
    expect((await app.request('/v1/shop')).status).toBe(401);
    const owner = await seedOwner(testDb.db);
    const res = await app.request('/v1/shop', { headers: owner.headers });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shopId: owner.shopId });
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await app.request('/nope');
    expect(res.status).toBe(404);
  });
});

describe('requireAuth', () => {
  it('rejects the access token of a revoked session at once', async () => {
    const shop = new Hono<AppEnv>();
    shop.get('/shop', (c) => c.json({ ok: true }));
    const app = buildApp(
      { config: testConfig(), clock: new FakeClock(), log: new SilentLogger(), get db() { return testDb.db; } },
      { authed: [shop] },
    );
    const owner = await seedOwner(testDb.db);
    expect((await app.request('/v1/shop', { headers: owner.headers })).status).toBe(200);
    await testDb.db.query('UPDATE sessions SET revoked_at = $2 WHERE id = $1', [owner.sessionId, new Date()]);
    const res = await app.request('/v1/shop', { headers: owner.headers });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: 'session_revoked' } });
  });
});
