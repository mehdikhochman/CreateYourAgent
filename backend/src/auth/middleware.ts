import type { MiddlewareHandler } from 'hono';

import type { AppDeps } from '../deps';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { verifyAccessToken } from './tokens';

/**
 * Requires `Authorization: Bearer <access token>` and sets ownerId, shopId and
 * sessionId on the context. Every query in an authenticated route must filter
 * on c.var.shopId.
 */
export function requireAuth(deps: Pick<AppDeps, 'config' | 'clock'>): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header('authorization') ?? '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match?.[1]) throw new ApiError(401, 'unauthorized', 'Missing access token');
    const claims = await verifyAccessToken(deps.config.jwtSecret, match[1], deps.clock.now());
    if (!claims) throw new ApiError(401, 'unauthorized', 'Invalid or expired access token');
    c.set('ownerId', claims.ownerId);
    c.set('shopId', claims.shopId);
    c.set('sessionId', claims.sessionId);
    await next();
  };
}
