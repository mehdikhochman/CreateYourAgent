/**
 * Test helpers: customers, conversations and messages written with plain SQL,
 * so these tests don't depend on the WhatsApp webhook module.
 */
import type { Db } from '../db/pool';
import { seedChannel, seedDemoProfile, seedOwner, type SeededOwner } from '../test/seed';

let waCounter = 0;

export async function seedConversation(
  db: Db,
  shopId: string,
  opts: {
    waId?: string;
    name?: string;
    lastMessageAt?: Date;
    lastCustomerMessageAt?: Date | null;
    aiPausedUntil?: Date | null;
    needsAttention?: boolean;
    unreadCount?: number;
  } = {},
): Promise<{ conversationId: string; customerId: string; waId: string }> {
  waCounter += 1;
  const waId = opts.waId ?? `22507000${String(waCounter).padStart(5, '0')}`;
  const at = opts.lastMessageAt ?? new Date('2026-10-05T09:59:00.000Z');
  const customer = await db.query<{ id: string }>(
    'INSERT INTO customers (shop_id, wa_id, display_name) VALUES ($1, $2, $3) RETURNING id',
    [shopId, waId, opts.name ?? 'Fatou'],
  );
  const customerId = customer.rows[0]!.id;
  const conv = await db.query<{ id: string }>(
    `INSERT INTO conversations (shop_id, customer_id, last_message_at, last_customer_message_at,
                                ai_paused_until, needs_attention, unread_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      shopId,
      customerId,
      at,
      opts.lastCustomerMessageAt === undefined ? at : opts.lastCustomerMessageAt,
      opts.aiPausedUntil ?? null,
      opts.needsAttention ?? false,
      opts.unreadCount ?? 0,
    ],
  );
  return { conversationId: conv.rows[0]!.id, customerId, waId };
}

let wamidCounter = 0;

export async function addMessage(
  db: Db,
  m: {
    shopId: string;
    conversationId: string;
    role: 'customer' | 'assistant' | 'owner';
    text?: string;
    kind?: string;
    status?: string;
    /** Customer messages get a generated wamid unless null is given. */
    wamid?: string | null;
    clientId?: string;
    engine?: Record<string, unknown>;
    createdAt: Date;
  },
): Promise<string> {
  wamidCounter += 1;
  const wamid = m.wamid !== undefined ? m.wamid : m.role === 'customer' ? `wamid.in.${wamidCounter}` : null;
  const res = await db.query<{ id: string }>(
    `INSERT INTO messages (shop_id, conversation_id, role, kind, text, status, wamid, client_id, engine, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    [
      m.shopId,
      m.conversationId,
      m.role,
      m.kind ?? 'text',
      m.text ?? '',
      m.status ?? (m.role === 'customer' ? 'received' : 'sent'),
      wamid,
      m.clientId ?? null,
      m.engine ? JSON.stringify(m.engine) : null,
      m.createdAt,
    ],
  );
  return res.rows[0]!.id;
}

/** An owner with the demo profile, a connected WhatsApp number and a device that receives pushes. */
export async function seedShop(db: Db, opts: { pushToken?: string | null } = {}): Promise<SeededOwner> {
  const owner = await seedOwner(db, {
    pushToken: opts.pushToken === null ? undefined : (opts.pushToken ?? 'ExponentPushToken[owner-phone]'),
  });
  await seedDemoProfile(db, owner.shopId);
  await seedChannel(db, owner.shopId, `pnid-${owner.shopId.slice(0, 8)}`);
  return owner;
}

/** `ms` after 2026-10-05T10:00:00Z, the FakeClock's start. */
export const at = (ms: number) => new Date(Date.parse('2026-10-05T10:00:00.000Z') + ms);
