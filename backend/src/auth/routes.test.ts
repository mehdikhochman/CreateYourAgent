import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../http/build-app';
import type { AppEnv } from '../http/env';
import { useTestDb } from '../test/db';
import { makeTestDeps, testConfig, type TestDeps } from '../test/fakes';
import { seedOwner } from '../test/seed';
import { authRoutes } from './routes';
import { ACCESS_TOKEN_TTL_SECONDS } from './tokens';

const testDb = useTestDb();

const MINUTE = 60_000;
const DAY = 86_400_000;
const PHONE = '+2250748123390';

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNew: boolean;
  owner: { id: string; phone: string; firstName: string };
  shopId: string;
};

function setup(overrides: Partial<TestDeps> = {}) {
  const deps = makeTestDeps(testDb.db, overrides);
  const whoami = new Hono<AppEnv>();
  whoami.get('/whoami', (c) =>
    c.json({ ownerId: c.var.ownerId, shopId: c.var.shopId, sessionId: c.var.sessionId }),
  );
  const app = buildApp(deps, { auth: authRoutes(deps), authed: [whoami] });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    app.request(`/v1/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  /** Code from the last SMS sent to `phone`. */
  const lastCode = (phone = PHONE): string => {
    const sms = deps.sms.sent.filter((s) => s.phone === phone).at(-1);
    const code = sms && /^(\d{6}) /.exec(sms.text)?.[1];
    if (!code) throw new Error(`no SMS code for ${phone}`);
    return code;
  };

  const login = async (phone = PHONE, extra: Record<string, unknown> = {}): Promise<LoginResponse> => {
    expect((await post('/otp', { phone })).status).toBe(204);
    const res = await post('/verify', { phone, code: lastCode(phone), ...extra });
    expect(res.status).toBe(200);
    return (await res.json()) as LoginResponse;
  };

  const whoamiWith = (token: string) => app.request('/v1/whoami', { headers: { Authorization: `Bearer ${token}` } });

  return { deps, app, post, lastCode, login, whoamiWith };
}

async function errorCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

async function latestOtp(phone = PHONE) {
  const res = await testDb.db.query<{ attempts: number; consumed_at: Date | null; expires_at: Date }>(
    'SELECT attempts, consumed_at, expires_at FROM otp_codes WHERE phone = $1 ORDER BY created_at DESC LIMIT 1',
    [phone],
  );
  return res.rows[0]!;
}

async function countRows(table: 'owners' | 'shops' | 'sessions' | 'otp_codes'): Promise<number> {
  const res = await testDb.db.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return res.rows[0]!.n;
}

describe('POST /v1/auth/otp + /verify', () => {
  it('logs in a new owner with the code sent by SMS', async () => {
    const { deps, post, lastCode, whoamiWith } = setup();

    const otp = await post('/otp', { phone: '+225 07 48 12 33 90' });
    expect(otp.status).toBe(204);
    expect(deps.sms.sent).toHaveLength(1);
    expect(deps.sms.sent[0]!.phone).toBe(PHONE);
    expect(deps.sms.sent[0]!.text).toMatch(/^\d{6} est votre code CréeTonAgent\. Il expire dans 10 minutes\.$/);

    const stored = await testDb.db.query<{ code_hash: string; expires_at: Date }>('SELECT * FROM otp_codes');
    expect(stored.rows[0]!.code_hash).not.toContain(lastCode());
    expect(stored.rows[0]!.expires_at).toEqual(new Date(deps.clock.now().getTime() + 10 * MINUTE));

    const res = await post('/verify', { phone: PHONE, code: lastCode(), deviceName: 'iPhone de Awa', platform: 'ios' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect(body).toEqual({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      isNew: true,
      owner: { id: expect.any(String), phone: PHONE, firstName: '' },
      shopId: expect.any(String),
    });

    const me = await whoamiWith(body.accessToken);
    expect(me.status).toBe(200);
    const claims = (await me.json()) as { ownerId: string; shopId: string; sessionId: string };
    expect(claims.ownerId).toBe(body.owner.id);
    expect(claims.shopId).toBe(body.shopId);

    const session = await testDb.db.query(
      'SELECT owner_id, device_name, platform, expires_at, revoked_at FROM sessions WHERE id = $1',
      [claims.sessionId],
    );
    expect(session.rows[0]).toEqual({
      owner_id: body.owner.id,
      device_name: 'iPhone de Awa',
      platform: 'ios',
      expires_at: new Date(deps.clock.now().getTime() + 180 * DAY),
      revoked_at: null,
    });
    expect((await latestOtp()).consumed_at).toEqual(deps.clock.now());
  });

  it('recognizes a returning owner (same owner, same shop)', async () => {
    const { login } = setup();
    const first = await login();
    const second = await login();
    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.owner.id).toBe(first.owner.id);
    expect(second.shopId).toBe(first.shopId);
    expect(await countRows('owners')).toBe(1);
    expect(await countRows('shops')).toBe(1);
    expect(await countRows('sessions')).toBe(2);
  });

  it('logs into an existing account with its shop', async () => {
    const seeded = await seedOwner(testDb.db, { phone: PHONE, firstName: 'Awa' });
    const { login } = setup();
    const body = await login();
    expect(body.isNew).toBe(false);
    expect(body.owner).toEqual({ id: seeded.ownerId, phone: PHONE, firstName: 'Awa' });
    expect(body.shopId).toBe(seeded.shopId);
  });

  it('answers /otp the same way whether or not the number has an account', async () => {
    await seedOwner(testDb.db, { phone: PHONE });
    const { deps, post } = setup();
    const known = await post('/otp', { phone: PHONE });
    const unknown = await post('/otp', { phone: '+2250500000002' });
    expect([known.status, unknown.status]).toEqual([204, 204]);
    expect([await known.text(), await unknown.text()]).toEqual(['', '']);
    expect(deps.sms.sent.map((s) => s.phone)).toEqual([PHONE, '+2250500000002']);
  });

  it('rejects an invalid phone number', async () => {
    const { deps, post } = setup();
    const res = await post('/otp', { phone: '0748' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_phone');
    expect(deps.sms.sent).toHaveLength(0);

    const verify = await post('/verify', { phone: 'abc', code: '123456' });
    expect(verify.status).toBe(400);
    expect(await errorCode(verify)).toBe('invalid_phone');
  });

  it('rejects malformed bodies', async () => {
    const { post } = setup();
    expect((await post('/otp', {})).status).toBe(400);
    expect((await post('/verify', { phone: PHONE, code: '12345' })).status).toBe(400);
    expect((await post('/verify', { phone: PHONE, code: '123456', platform: 'windows' })).status).toBe(400);
    expect((await post('/verify', { phone: PHONE, code: '123456', deviceName: 'x'.repeat(101) })).status).toBe(400);
  });

  it('answers invalid_code when no code was requested', async () => {
    const { post } = setup();
    const res = await post('/verify', { phone: PHONE, code: '123456' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_code');
  });

  it('counts wrong codes and locks the code after 5', async () => {
    const { post, lastCode } = setup();
    await post('/otp', { phone: PHONE });
    const good = lastCode();
    const wrong = good === '000000' ? '111111' : '000000';

    const first = await post('/verify', { phone: PHONE, code: wrong });
    expect(first.status).toBe(400);
    expect(await errorCode(first)).toBe('invalid_code');
    expect((await latestOtp()).attempts).toBe(1);

    for (let i = 2; i <= 5; i++) expect((await post('/verify', { phone: PHONE, code: wrong })).status).toBe(400);
    expect((await latestOtp()).attempts).toBe(5);

    // Even the right code is refused now.
    const locked = await post('/verify', { phone: PHONE, code: good });
    expect(locked.status).toBe(429);
    expect(await errorCode(locked)).toBe('too_many_attempts');
    expect(await countRows('owners')).toBe(0);
  });

  it('refuses an expired code', async () => {
    const { deps, post, lastCode } = setup();
    await post('/otp', { phone: PHONE });
    deps.clock.advance(11 * MINUTE);
    const res = await post('/verify', { phone: PHONE, code: lastCode() });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_code');
  });

  it('refuses a code that was already used', async () => {
    const { post, lastCode, login } = setup();
    await login();
    const again = await post('/verify', { phone: PHONE, code: lastCode() });
    expect(again.status).toBe(400);
    expect(await errorCode(again)).toBe('invalid_code');
  });

  it('only accepts the latest code', async () => {
    const { post, lastCode } = setup();
    await post('/otp', { phone: PHONE });
    const old = lastCode();
    await post('/otp', { phone: PHONE });
    const latest = lastCode();
    if (old !== latest) expect((await post('/verify', { phone: PHONE, code: old })).status).toBe(400);
    expect((await post('/verify', { phone: PHONE, code: latest })).status).toBe(200);
  });

  it('limits codes to 3 per phone per 15 minutes', async () => {
    const { deps, post } = setup();
    for (let i = 0; i < 3; i++) {
      expect((await post('/otp', { phone: PHONE }, { 'x-forwarded-for': `10.0.0.${i}` })).status).toBe(204);
      deps.clock.advance(MINUTE);
    }
    const limited = await post('/otp', { phone: PHONE }, { 'x-forwarded-for': '10.0.0.9' });
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('rate_limited');
    expect(deps.sms.sent).toHaveLength(3);

    // Another number is not affected.
    expect((await post('/otp', { phone: '+2250500000001' })).status).toBe(204);

    // 15 minutes after the first code, one slot frees up.
    deps.clock.advance(12 * MINUTE + 1);
    expect((await post('/otp', { phone: PHONE })).status).toBe(204);
    expect((await post('/otp', { phone: PHONE })).status).toBe(429);
  });

  it('limits requests to 10 per IP per hour', async () => {
    const { deps, post } = setup();
    const ip = { 'x-forwarded-for': '41.202.10.5, 10.0.0.1' };
    for (let i = 0; i < 10; i++) {
      expect((await post('/otp', { phone: `+22507000001${String(i).padStart(2, '0')}` }, ip)).status).toBe(204);
    }
    const limited = await post('/otp', { phone: '+2250700000199' }, ip);
    expect(limited.status).toBe(429);
    expect(await errorCode(limited)).toBe('rate_limited');
    expect(deps.sms.sent).toHaveLength(10);

    // The first x-forwarded-for entry is the client; another client is fine.
    expect((await post('/otp', { phone: '+2250700000199' }, { 'x-forwarded-for': '41.202.10.6' })).status).toBe(204);

    deps.clock.advance(60 * MINUTE + 1);
    expect((await post('/otp', { phone: '+2250700000198' }, ip)).status).toBe(204);
  });

  it('gives test numbers a fixed code, no SMS and no rate limit', async () => {
    const testPhone = '+2250700000000';
    const { deps, post, whoamiWith } = setup({
      config: testConfig({ authTestCodes: new Map([[testPhone, '424242']]) }),
    });
    for (let i = 0; i < 12; i++) expect((await post('/otp', { phone: testPhone }, { 'x-forwarded-for': '1.2.3.4' })).status).toBe(204);
    expect(deps.sms.sent).toHaveLength(0);

    const res = await post('/verify', { phone: testPhone, code: '424242' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as LoginResponse;
    expect((await whoamiWith(body.accessToken)).status).toBe(200);

    // Test-number requests didn't use up the IP's budget.
    expect((await post('/otp', { phone: PHONE }, { 'x-forwarded-for': '1.2.3.4' })).status).toBe(204);
  });

  it('answers sms_failed and frees the slot when the SMS cannot be sent', async () => {
    const { deps, post } = setup();
    deps.sms.send = async () => {
      throw new Error('provider down');
    };
    const res = await post('/otp', { phone: PHONE });
    expect(res.status).toBe(502);
    expect(await errorCode(res)).toBe('sms_failed');
    expect(await countRows('otp_codes')).toBe(0);
  });

  it('creates exactly one owner and one shop when the same code is verified twice at once', async () => {
    const { post, lastCode } = setup();
    await post('/otp', { phone: PHONE });
    const code = lastCode();
    const results = await Promise.all([
      post('/verify', { phone: PHONE, code }),
      post('/verify', { phone: PHONE, code }),
      post('/verify', { phone: PHONE, code }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
    expect(await countRows('owners')).toBe(1);
    expect(await countRows('shops')).toBe(1);
    expect(await countRows('sessions')).toBe(1);
  });
});

describe('POST /v1/auth/refresh', () => {
  it('rotates the refresh token; the old one stops working', async () => {
    const { deps, post, login, whoamiWith } = setup();
    const first = await login();
    deps.clock.advance(2 * 60 * MINUTE); // the access token has expired
    expect((await whoamiWith(first.accessToken)).status).toBe(401);

    const res = await post('/refresh', { refreshToken: first.refreshToken });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; refreshToken: string; expiresIn: number };
    expect(body.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(body.refreshToken).not.toBe(first.refreshToken);

    const me = await whoamiWith(body.accessToken);
    expect(me.status).toBe(200);
    const claims = (await me.json()) as { ownerId: string; shopId: string; sessionId: string };
    expect(claims).toMatchObject({ ownerId: first.owner.id, shopId: first.shopId });
    const session = await testDb.db.query<{ last_seen_at: Date }>('SELECT last_seen_at FROM sessions WHERE id = $1', [
      claims.sessionId,
    ]);
    expect(session.rows[0]!.last_seen_at).toEqual(deps.clock.now());

    const reused = await post('/refresh', { refreshToken: first.refreshToken });
    expect(reused.status).toBe(401);
    expect(await errorCode(reused)).toBe('invalid_refresh_token');
    expect((await post('/refresh', { refreshToken: body.refreshToken })).status).toBe(200);
  });

  it('lets a refresh token be used only once even in parallel', async () => {
    const { post, login } = setup();
    const { refreshToken } = await login();
    const results = await Promise.all([post('/refresh', { refreshToken }), post('/refresh', { refreshToken })]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('rejects unknown, revoked and expired sessions', async () => {
    const { deps, post, login } = setup();
    expect((await post('/refresh', { refreshToken: 'nope' })).status).toBe(401);

    const revoked = await login();
    expect((await post('/logout', {}, { Authorization: `Bearer ${revoked.accessToken}` })).status).toBe(204);
    const afterLogout = await post('/refresh', { refreshToken: revoked.refreshToken });
    expect(afterLogout.status).toBe(401);
    expect(await errorCode(afterLogout)).toBe('invalid_refresh_token');

    const old = await login();
    deps.clock.advance(181 * DAY);
    expect((await post('/refresh', { refreshToken: old.refreshToken })).status).toBe(401);
  });
});

describe('POST /v1/auth/logout', () => {
  it('requires an access token', async () => {
    const { post } = setup();
    expect((await post('/logout', {})).status).toBe(401);
  });

  it('revokes the session and clears its push token, leaving other devices alone', async () => {
    const { deps, post, login } = setup();
    const phone1 = await login(PHONE, { platform: 'android' });
    const phone2 = await login(PHONE, { platform: 'ios' });
    await testDb.db.query(`UPDATE sessions SET push_token = 'ExponentPushToken[abc]'`);

    deps.clock.advance(MINUTE);
    const res = await post('/logout', {}, { Authorization: `Bearer ${phone1.accessToken}` });
    expect(res.status).toBe(204);

    const sessions = await testDb.db.query<{ platform: string; revoked_at: Date | null; push_token: string | null }>(
      'SELECT platform, revoked_at, push_token FROM sessions ORDER BY platform',
    );
    expect(sessions.rows).toEqual([
      { platform: 'android', revoked_at: deps.clock.now(), push_token: null },
      { platform: 'ios', revoked_at: null, push_token: 'ExponentPushToken[abc]' },
    ]);
    expect((await post('/refresh', { refreshToken: phone2.refreshToken })).status).toBe(200);

    // Logging out twice is harmless and keeps the first revocation time.
    deps.clock.advance(MINUTE);
    expect((await post('/logout', {}, { Authorization: `Bearer ${phone1.accessToken}` })).status).toBe(204);
    const again = await testDb.db.query<{ revoked_at: Date }>(
      `SELECT revoked_at FROM sessions WHERE platform = 'android'`,
    );
    expect(again.rows[0]!.revoked_at).toEqual(new Date(deps.clock.now().getTime() - MINUTE));
  });
});
