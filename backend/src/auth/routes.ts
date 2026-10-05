/**
 * Phone + SMS-code login, mounted at /v1/auth (design doc §7 "Auth").
 * Only /logout needs an access token.
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';

import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import { normalizePhone } from '../domain/phone';
import { ApiError } from '../http/errors';
import { parseBody } from '../http/validate';
import { findOrCreateOwner } from './accounts';
import { requireAuth } from './middleware';
import { consumeCode, newIpLimiter, requestCode, type SlidingWindowLimiter } from './otp';
import { createSession, revokeSession, rotateRefreshToken } from './sessions';
import { ACCESS_TOKEN_TTL_SECONDS, hashRefreshToken, signAccessToken } from './tokens';

const OtpBody = z.object({ phone: z.string().max(40) });

const VerifyBody = z.object({
  phone: z.string().max(40),
  code: z.string().regex(/^\d{6}$/),
  deviceName: z.string().max(100).optional(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

type VerifyResult =
  | { check: 'invalid_code' | 'too_many_attempts' }
  | {
      check: 'ok';
      account: Awaited<ReturnType<typeof findOrCreateOwner>>;
      session: Awaited<ReturnType<typeof createSession>>;
    };

const RefreshBody = z.object({ refreshToken: z.string().min(1).max(200) });

function requirePhone(raw: string): string {
  const phone = normalizePhone(raw);
  if (!phone) throw new ApiError(400, 'invalid_phone', 'Numéro de téléphone invalide');
  return phone;
}

/** Client IP: first x-forwarded-for entry (set by the hosting proxy), or 'unknown'. */
function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

export function authRoutes(deps: AppDeps, opts: { ipLimiter?: SlidingWindowLimiter } = {}): Hono {
  const ipLimiter = opts.ipLimiter ?? newIpLimiter();
  const app = new Hono();

  // Same answer whether or not the number has an account.
  app.post('/otp', async (c) => {
    const body = await parseBody(c, OtpBody);
    const phone = requirePhone(body.phone);
    const result = await requestCode(deps, ipLimiter, { phone, ip: clientIp(c) });
    if (result === 'rate_limited') {
      throw new ApiError(429, 'rate_limited', 'Trop de demandes de code. Réessayez plus tard.');
    }
    if (result === 'sms_failed') {
      throw new ApiError(502, 'sms_failed', "Le SMS n'a pas pu être envoyé. Réessayez.");
    }
    return c.body(null, 204);
  });

  app.post('/verify', async (c) => {
    const body = await parseBody(c, VerifyBody);
    const phone = requirePhone(body.phone);
    const now = deps.clock.now();

    const result = await withTransaction(deps.db, async (tx): Promise<VerifyResult> => {
      const check = await consumeCode(tx, deps.config.otpSecret, { phone, code: body.code, now });
      if (check !== 'ok') return { check };
      const account = await findOrCreateOwner(tx, phone, now);
      const session = await createSession(tx, {
        ownerId: account.owner.id,
        deviceName: body.deviceName ?? '',
        platform: body.platform ?? '',
        now,
      });
      return { check, account, session };
    });

    if (result.check !== 'ok') {
      throw result.check === 'too_many_attempts'
        ? new ApiError(429, 'too_many_attempts', "Trop d'essais. Demandez un nouveau code.")
        : new ApiError(400, 'invalid_code', 'Code incorrect ou expiré.');
    }
    const { account, session } = result;
    const accessToken = await signAccessToken(
      deps.config.jwtSecret,
      { ownerId: account.owner.id, shopId: account.shopId, sessionId: session.sessionId },
      now,
    );
    return c.json({
      accessToken,
      refreshToken: session.refreshToken,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      isNew: account.isNew,
      owner: account.owner,
      shopId: account.shopId,
    });
  });

  app.post('/refresh', async (c) => {
    const body = await parseBody(c, RefreshBody);
    const now = deps.clock.now();
    const rotated = await rotateRefreshToken(deps.db, hashRefreshToken(body.refreshToken), now);
    if (!rotated) throw new ApiError(401, 'invalid_refresh_token', 'Session expirée. Reconnectez-vous.');
    const accessToken = await signAccessToken(
      deps.config.jwtSecret,
      { ownerId: rotated.ownerId, shopId: rotated.shopId, sessionId: rotated.sessionId },
      now,
    );
    return c.json({ accessToken, refreshToken: rotated.refreshToken, expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  });

  app.post('/logout', requireAuth(deps, { allowRevoked: true }), async (c) => {
    await revokeSession(deps.db, { sessionId: c.var.sessionId, ownerId: c.var.ownerId, now: deps.clock.now() });
    return c.body(null, 204);
  });

  return app;
}
