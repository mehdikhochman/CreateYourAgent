import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import { requireAuth } from '../auth/middleware';
import type { AppDeps } from '../deps';
import { errorHandler } from './errors';
import type { AppEnv } from './env';

export type Routers = {
  /** Mounted at /v1/auth, no access token required (logout checks it itself). */
  auth?: Hono;
  /** Mounted at /v1 behind requireAuth. Routes read c.var.shopId / ownerId / sessionId. */
  authed?: Hono<AppEnv>[];
  /** Public machine endpoints, e.g. { path: '/webhooks/meta', router }. */
  public?: { path: string; router: Hono }[];
};

/** Largest request body accepted anywhere (the biggest real body, a webhook, is a few KB). */
export const MAX_BODY_BYTES = 1024 * 1024;

/**
 * Assembles the HTTP app. src/app.ts calls it with every module's routers;
 * module tests call it with just their own router.
 */
export function buildApp(deps: Pick<AppDeps, 'config' | 'clock' | 'log' | 'db'>, routers: Routers): Hono {
  const app = new Hono();
  app.onError(errorHandler(deps.log));
  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));
  // Without a limit, one huge request (even to a public route like /v1/auth/otp)
  // is read fully into memory and can take the server down.
  app.use(
    '*',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: { code: 'payload_too_large', message: 'Request body too large' } }, 413),
    }),
  );

  app.get('/health', (c) => c.json({ ok: true }));

  for (const p of routers.public ?? []) app.route(p.path, p.router);
  if (routers.auth) app.route('/v1/auth', routers.auth);

  const authed = new Hono<AppEnv>();
  authed.use('*', requireAuth(deps));
  for (const r of routers.authed ?? []) authed.route('/', r);
  app.route('/v1', authed);

  return app;
}
