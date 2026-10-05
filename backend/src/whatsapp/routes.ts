import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';

import type { AppDeps } from '../deps';
import { ApiError } from '../http/errors';
import { ingestEvents } from './ingest';
import { parseMetaWebhook } from './parse';
import { verifyMetaSignature } from './signature';

/** Meta's payloads are a few KB; the body is read before the signature can be checked. */
const MAX_BODY_BYTES = 1024 * 1024;

/** Meta's webhook, mounted at /webhooks/meta. */
export function metaWebhookRoutes(deps: AppDeps): Hono {
  const app = new Hono();

  // Subscription check Meta runs when the webhook URL is saved in the app dashboard.
  app.get('/', (c) => {
    const expected = deps.config.meta.verifyToken;
    if (expected && c.req.query('hub.mode') === 'subscribe' && c.req.query('hub.verify_token') === expected) {
      return c.text(c.req.query('hub.challenge') ?? '', 200);
    }
    return c.text('Forbidden', 403);
  });

  app.post('/', bodyLimit({ maxSize: MAX_BODY_BYTES }), async (c) => {
    const { appSecret } = deps.config.meta;
    if (!appSecret && deps.config.nodeEnv === 'production') {
      throw new ApiError(503, 'webhook_not_configured', 'META_APP_SECRET is not set');
    }
    const raw = await c.req.text();
    if (appSecret) {
      if (!verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), appSecret)) {
        throw new ApiError(401, 'invalid_signature', 'Invalid signature');
      }
    } else {
      deps.log.warn('meta webhook: META_APP_SECRET is not set, accepting an unsigned payload (local testing only)');
    }

    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'invalid_json', 'Body must be JSON');
    }

    const eventId = await storePayload(deps, raw);

    try {
      const events = parseMetaWebhook(body);
      const { inserted } = await ingestEvents(deps, events);
      deps.log.info('meta webhook: received', { webhookEventId: eventId, events: events.length, newMessages: inserted });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      deps.log.error('meta webhook: ingest failed', { webhookEventId: eventId, error: message });
      if (eventId !== null) {
        await deps.db
          .query('UPDATE webhook_events SET error = $2 WHERE id = $1', [eventId, message])
          .catch(() => {});
      }
      // Meta retries on non-2xx; ingest is idempotent thanks to the unique wamid.
      throw new ApiError(500, 'ingest_failed', 'Could not process the event');
    }

    if (eventId !== null) {
      await deps.db.query('UPDATE webhook_events SET processed_at = $2 WHERE id = $1', [eventId, deps.clock.now()]);
    }
    return c.text('EVENT_RECEIVED', 200);
  });

  return app;
}

/**
 * Keeps the raw payload to replay or debug real traffic. Best effort: a body
 * Postgres refuses as jsonb (e.g. a \u0000 escape) must not block the messages in it.
 */
async function storePayload(deps: AppDeps, raw: string): Promise<number | null> {
  try {
    const stored = await deps.db.query<{ id: number }>(
      `INSERT INTO webhook_events (source, payload, received_at) VALUES ('meta', $1::jsonb, $2) RETURNING id`,
      [raw, deps.clock.now()],
    );
    return stored.rows[0]!.id;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    deps.log.error('meta webhook: could not store the payload', { error });
    return null;
  }
}
