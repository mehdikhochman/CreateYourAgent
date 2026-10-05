/**
 * Shop module, mounted at /v1 behind requireAuth (design doc §7 "App"):
 * profile, catalogue, learned answers and corrections, test chat, WhatsApp
 * number linking and delta sync. Every query filters on c.var.shopId.
 */
import { Hono } from 'hono';

import type { AppDeps } from '../deps';
import type { AppEnv } from '../http/env';
import { answerRoutes } from './answers';
import { assistantTestRoutes } from './assistant-test';
import { catalogRoutes } from './catalog';
import { channelRoutes } from './channel';
import { profileRoutes } from './profile';
import { syncRoutes } from './sync';

export function shopRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.route('/', profileRoutes(deps));
  app.route('/', catalogRoutes(deps));
  app.route('/', answerRoutes(deps));
  app.route('/', assistantTestRoutes(deps));
  app.route('/', channelRoutes(deps));
  app.route('/', syncRoutes(deps));
  return app;
}
