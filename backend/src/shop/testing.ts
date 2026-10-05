/** Test helpers for the shop module (not a test file itself). */
import type { Hono } from 'hono';

import type { Db } from '../db/pool';
import { buildApp } from '../http/build-app';
import { makeTestDeps, type TestDeps } from '../test/fakes';
import type { SeededOwner } from '../test/seed';
import { shopRoutes } from './routes';

export function shopApp(db: Db, overrides: Partial<TestDeps> = {}): { app: Hono; deps: TestDeps } {
  const deps = makeTestDeps(db, overrides);
  return { app: buildApp(deps, { authed: [shopRoutes(deps)] }), deps };
}

/** Calls /v1<path> as `owner` with a JSON body; returns the status and the parsed JSON (null if empty). */
export async function call(
  app: Hono,
  owner: SeededOwner,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const res = await app.request(`/v1${path}`, {
    method,
    headers: { ...owner.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** Creates a customer and their conversation in `shopId`. */
export async function seedConversation(
  db: Db,
  shopId: string,
  opts: { waId?: string; name?: string; lastCustomerMessageAt?: Date | null } = {},
): Promise<{ conversationId: string; customerId: string }> {
  const customer = await db.query<{ id: string }>(
    'INSERT INTO customers (shop_id, wa_id, display_name) VALUES ($1, $2, $3) RETURNING id',
    [shopId, opts.waId ?? `22507${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, opts.name ?? 'Fatou'],
  );
  const customerId = customer.rows[0]!.id;
  const conversation = await db.query<{ id: string }>(
    'INSERT INTO conversations (shop_id, customer_id, last_customer_message_at) VALUES ($1, $2, $3) RETURNING id',
    [shopId, customerId, opts.lastCustomerMessageAt ?? null],
  );
  return { conversationId: conversation.rows[0]!.id, customerId };
}

export async function seedMessage(
  db: Db,
  input: { shopId: string; conversationId: string; role: 'customer' | 'assistant' | 'owner'; text: string; at?: Date },
): Promise<string> {
  const res = await db.query<{ id: string }>(
    `INSERT INTO messages (shop_id, conversation_id, role, text, created_at)
     VALUES ($1, $2, $3, $4, COALESCE($5, now())) RETURNING id`,
    [input.shopId, input.conversationId, input.role, input.text, input.at ?? null],
  );
  return res.rows[0]!.id;
}
