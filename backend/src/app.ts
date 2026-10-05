import { authRoutes } from './auth/routes';
import { conversationRoutes } from './conversations/routes';
import type { AppDeps } from './deps';
import { buildApp } from './http/build-app';
import { shopRoutes } from './shop/routes';
import { metaWebhookRoutes } from './whatsapp/routes';

/** The whole HTTP API: app endpoints under /v1, Meta's webhook, /health. */
export function createApp(deps: AppDeps) {
  return buildApp(deps, {
    auth: authRoutes(deps),
    authed: [shopRoutes(deps), conversationRoutes(deps)],
    public: [{ path: '/webhooks/meta', router: metaWebhookRoutes(deps) }],
  });
}
