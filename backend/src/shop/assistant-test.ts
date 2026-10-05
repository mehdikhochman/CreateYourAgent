/** POST /assistant/test: the « Tester mon assistant » chat, on the real engine. Not counted in any quota. */
import { Hono } from 'hono';
import { z } from 'zod';

import type { AppDeps } from '../deps';
import { loadShopProfile } from '../domain/profile-repo';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody } from '../http/validate';
import { notFound } from './sql';

export const TEST_CHAT_DAILY_LIMIT = 200;

/**
 * Counts calls per key for the current UTC day. In memory and per process:
 * it resets on restart, which is fine for a cost guard on a free feature.
 */
export class DailyCounter {
  private day = '';
  private counts = new Map<string, number>();

  constructor(private readonly limit: number) {}

  /** Counts one call for `key`; false (and not counted) once today's limit is reached. */
  take(key: string, now: Date): boolean {
    const day = now.toISOString().slice(0, 10);
    if (day !== this.day) {
      this.day = day;
      this.counts.clear();
    }
    const used = this.counts.get(key) ?? 0;
    if (used >= this.limit) return false;
    this.counts.set(key, used + 1);
    return true;
  }
}

const TestChatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(['customer', 'assistant']), text: z.string().trim().min(1).max(1000) }))
    .min(1)
    .max(20)
    .refine((turns) => turns.at(-1)?.role === 'customer', 'The last message must be from the customer'),
});

export function assistantTestRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const counter = new DailyCounter(TEST_CHAT_DAILY_LIMIT);

  app.post('/assistant/test', async (c) => {
    const body = await parseBody(c, TestChatBody);
    const shopId = c.var.shopId;
    if (!counter.take(shopId, deps.clock.now())) {
      throw new ApiError(429, 'test_limit', 'Limite de tests atteinte pour aujourd’hui. Réessayez demain.');
    }
    const profile = await loadShopProfile(deps.db, shopId);
    if (!profile) throw notFound();

    const turns = body.messages.map((m) => ({ role: m.role, text: m.text }));
    const last = turns.pop()!; // the schema guarantees at least one turn
    try {
      const { reply, meta } = await deps.assistant.respond({ profile, history: turns, message: last.text });
      return c.json({ reply, meta: { action: meta.action, source: meta.source } });
    } catch (err) {
      deps.log.error('assistant test failed', { shopId, error: (err as Error).message });
      throw new ApiError(502, 'assistant_failed', 'L’assistant n’a pas pu répondre. Réessayez.');
    }
  });

  return app;
}
