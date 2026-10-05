/**
 * Writes parsed webhook events to the database (design doc §4 steps 1–2 and
 * "Taking over"). Idempotent: a message's `wamid` is unique, so a webhook Meta
 * sends again inserts nothing and enqueues nothing.
 */
import { type DbClient, withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import type { DeliveryStatus, InboundEcho, InboundEvent, InboundMessage, InboundStatus } from './parse';

/** Job kind the worker runs to answer a conversation. */
export const REPLY_JOB_KIND = 'reply';

/** Statuses a message may move from, per new status. Never goes backwards. */
const ALLOWED_FROM: Record<DeliveryStatus, string[]> = {
  sent: ['queued'],
  delivered: ['queued', 'sent'],
  read: ['queued', 'sent', 'delivered'],
  failed: ['queued', 'sent'],
};

type Outcome = { inserted: boolean; replyTo?: string };

export async function ingestEvents(deps: AppDeps, events: InboundEvent[]): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const event of events) {
    const outcome = await withTransaction(deps.db, async (client) => {
      const result = await ingestOne(deps, client, event);
      // Same transaction as the message: both commit or neither does, so a
      // stored message always has its reply job (Meta's retry would dedupe it).
      if (result.replyTo) await enqueueReply(deps, client, result.replyTo);
      return result;
    });
    if (outcome.inserted) inserted += 1;
  }
  return { inserted };
}

async function ingestOne(deps: AppDeps, client: DbClient, event: InboundEvent): Promise<Outcome> {
  const channel = await client.query<{ shop_id: string }>(
    `SELECT shop_id FROM channels WHERE phone_number_id = $1 AND status = 'connected'`,
    [event.phoneNumberId],
  );
  const shopId = channel.rows[0]?.shop_id;
  if (!shopId) {
    deps.log.warn('whatsapp: event for an unknown or disconnected number, skipped', {
      phoneNumberId: event.phoneNumberId,
      type: event.type,
    });
    return { inserted: false };
  }
  switch (event.type) {
    case 'message':
      return ingestMessage(deps, client, shopId, event);
    case 'echo':
      return ingestEcho(deps, client, shopId, event);
    case 'status':
      await applyStatus(client, shopId, event);
      return { inserted: false };
  }
}

async function ingestMessage(deps: AppDeps, client: DbClient, shopId: string, m: InboundMessage): Promise<Outcome> {
  const now = deps.clock.now();
  const conversationId = await upsertConversation(client, shopId, m.from, m.profileName, now);
  const added = await client.query(
    `INSERT INTO messages (shop_id, conversation_id, role, kind, text, wamid, status, created_at)
     VALUES ($1, $2, 'customer', $3, $4, $5, 'received', $6)
     ON CONFLICT (wamid) DO NOTHING
     RETURNING id`,
    [shopId, conversationId, m.kind, m.text, m.wamid, now],
  );
  if (added.rowCount === 0) return { inserted: false };

  // The 24-hour window counts from when the customer wrote, never from the future.
  const sentAt = m.timestamp && m.timestamp.getTime() < now.getTime() ? m.timestamp : now;
  await client.query(
    `UPDATE conversations
        SET last_message_at = $2,
            last_customer_message_at = GREATEST(COALESCE(last_customer_message_at, $3::timestamptz), $3::timestamptz),
            unread_count = unread_count + 1
      WHERE id = $1`,
    [conversationId, now, sentAt],
  );
  // Always queued, even while the owner has taken over: the reply job decides.
  return { inserted: true, replyTo: conversationId };
}

/** The owner replied from the WhatsApp Business app: store it and pause the AI. */
async function ingestEcho(deps: AppDeps, client: DbClient, shopId: string, e: InboundEcho): Promise<Outcome> {
  const now = deps.clock.now();
  const conversationId = await upsertConversation(client, shopId, e.to, '', now);
  // Messages we send through the API already carry their wamid, so their echo is ignored here.
  const added = await client.query(
    `INSERT INTO messages (shop_id, conversation_id, role, kind, text, wamid, status, created_at)
     VALUES ($1, $2, 'owner', $3, $4, $5, 'sent', $6)
     ON CONFLICT (wamid) DO NOTHING
     RETURNING id`,
    [shopId, conversationId, e.kind, e.text, e.wamid, now],
  );
  if (added.rowCount === 0) return { inserted: false };

  await client.query(
    `UPDATE conversations c
        SET ai_paused_until = $2::timestamptz + make_interval(mins => s.takeover_minutes),
            last_message_at = $2
       FROM shops s
      WHERE c.id = $1 AND s.id = c.shop_id`,
    [conversationId, now],
  );
  return { inserted: true };
}

async function applyStatus(client: DbClient, shopId: string, s: InboundStatus): Promise<void> {
  const error = s.status === 'failed' && s.error ? formatError(s.error) : null;
  await client.query(
    `UPDATE messages SET status = $3, error = COALESCE($4, error)
      WHERE wamid = $1 AND shop_id = $2 AND status = ANY($5::text[])`,
    [s.wamid, shopId, s.status, error, ALLOWED_FROM[s.status]],
  );
}

function formatError(e: NonNullable<InboundStatus['error']>): string {
  const head = [e.code, e.title].filter((p) => p !== null && p !== '').join(' ');
  return [head, e.details].filter((p) => p !== '').join(': ') || 'unknown error';
}

/** Finds or creates the customer and their conversation; returns the conversation id. */
async function upsertConversation(
  client: DbClient,
  shopId: string,
  waId: string,
  profileName: string,
  now: Date,
): Promise<string> {
  const name = profileName.trim();
  let customerId = (
    await client.query<{ id: string }>(
      `INSERT INTO customers (shop_id, wa_id, display_name, first_seen_at) VALUES ($1, $2, $3, $4)
       ON CONFLICT (shop_id, wa_id) DO UPDATE SET display_name = EXCLUDED.display_name
         WHERE EXCLUDED.display_name <> '' AND customers.display_name <> EXCLUDED.display_name
       RETURNING id`,
      [shopId, waId, name, now],
    )
  ).rows[0]?.id;
  customerId ??= (
    await client.query<{ id: string }>('SELECT id FROM customers WHERE shop_id = $1 AND wa_id = $2', [shopId, waId])
  ).rows[0]!.id;

  const created = await client.query<{ id: string }>(
    `INSERT INTO conversations (shop_id, customer_id, last_message_at, created_at) VALUES ($1, $2, $3, $3)
     ON CONFLICT (customer_id) DO NOTHING
     RETURNING id`,
    [shopId, customerId, now],
  );
  if (created.rows[0]) return created.rows[0].id;
  const existing = await client.query<{ id: string }>(
    'SELECT id FROM conversations WHERE customer_id = $1 AND shop_id = $2',
    [customerId, shopId],
  );
  return existing.rows[0]!.id;
}

async function enqueueReply(deps: AppDeps, client: DbClient, conversationId: string): Promise<void> {
  const runAt = new Date(deps.clock.now().getTime() + deps.config.replyDebounceSeconds * 1000);
  // Same key while the job waits: a burst of messages pushes it back and gets one reply.
  await deps.jobs.enqueue(
    { kind: REPLY_JOB_KIND, key: `reply:${conversationId}`, payload: { conversationId }, runAt },
    client,
  );
}
