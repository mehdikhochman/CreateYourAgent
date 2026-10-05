import type { MiddlewareHandler } from 'hono';

import type { AppDeps } from '../deps';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { verifyAccessToken } from './tokens';

/**
 * Requires `Authorization: Bearer <access token>` and sets ownerId, shopId and
 * sessionId on the context. Every query in an authenticated route must filter
 * on c.var.shopId.
 *
 * The session must still be active, so logging out (or revoking a lost phone's
 * session) takes effect at once instead of when the 1-hour token expires.
 * `allowRevoked` skips that check; only logout uses it, so a retried logout
 * still succeeds.
 */
export function requireAuth(
  deps: Pick<AppDeps, 'config' | 'clock' | 'db'>,
  opts: { allowRevoked?: boolean } = {},
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1]) throw new ApiError(401, 'unauthorized', 'Missing access token');
    const now = deps.clock.now();
    const claims = await verifyAccessToken(deps.config.jwtSecret, match[1], now);
    if (!claims) throw new ApiError(401, 'unauthorized', 'Invalid or expired access token');
    if (!opts.allowRevoked) {
      const session = await deps.db.query(
        `SELECT 1 FROM sessions WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL AND expires_at > $3`,
        [claims.sessionId, claims.ownerId, now],
      );
      if (session.rowCount === 0) throw new ApiError(401, 'session_revoked', 'Session ended, please log in again');
    }
    c.set('ownerId', claims.ownerId);
    c.set('shopId', claims.shopId);
    c.set('sessionId', claims.sessionId);
    await next();
  };
}
