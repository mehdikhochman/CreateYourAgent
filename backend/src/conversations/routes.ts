/**
 * Conversations API, mounted at /v1 behind requireAuth (design doc §7 "App"):
 * inbox, messages, owner replies, takeover, alerts and the device push token.
 * Every query filters on c.var.shopId: another shop's row looks like a 404.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { type DbClient, withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import {
  type AlertRow,
  CONVERSATION_SELECT,
  type ConversationDTO,
  type ConversationRow,
  MESSAGE_COLUMNS,
  type MessageRow,
  toAlertDTO,
  toConversationDTO,
  toMessageDTO,
} from '../domain/api';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody, parseQuery, uuidParam } from '../http/validate';
import { ownerSendJobKey, SEND_OWNER_MESSAGE_JOB } from './owner-send-job';
import { cutPage } from './page';

const ALERT_COLUMNS = 'id, conversation_id, kind, summary, status, created_at, rev';

const Cursor = z.iso.datetime({ offset: true }).optional();

const ListQuery = z.object({
  filter: z.enum(['attention', 'all']).default('all'),
  before: Cursor,
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

const MessagesQuery = z.object({
  before: Cursor,
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const SendBody = z.object({
  clientId: z.guid(),
  text: z.string().trim().min(1).max(4096),
});

const DeviceBody = z.object({
  pushToken: z.string().trim().min(1).max(200).nullable(),
  platform: z.enum(['ios', 'android', 'web']).optional(),
});

const notFound = () => new ApiError(404, 'not_found', 'Not found');

async function loadConversation(db: DbClient, shopId: string, id: string, now: Date): Promise<ConversationDTO | null> {
  const res = await db.query<ConversationRow>(`${CONVERSATION_SELECT} WHERE c.id = $1 AND c.shop_id = $2`, [id, shopId]);
  const row = res.rows[0];
  return row ? toConversationDTO(row, now) : null;
}

async function requireConversation(db: DbClient, shopId: string, id: string, now: Date): Promise<ConversationDTO> {
  const conversation = await loadConversation(db, shopId, id, now);
  if (!conversation) throw notFound();
  return conversation;
}

export function conversationRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  /** Inbox, newest activity first. `filter=attention` is « À traiter ». */
  app.get('/conversations', async (c) => {
    const q = parseQuery(c, ListQuery);
    const shopId = c.var.shopId;
    const now = deps.clock.now();
    const res = await deps.db.query<ConversationRow>(
      `${CONVERSATION_SELECT}
        WHERE c.shop_id = $1
          AND ($2::text = 'all' OR c.needs_attention)
          AND ($3::timestamptz IS NULL OR c.last_message_at < $3)
        ORDER BY c.last_message_at DESC, c.id DESC
        LIMIT $4`,
      [shopId, q.filter, q.before ?? null, q.limit + 1],
    );
    const { page, nextBefore } = cutPage(res.rows, q.limit, (r) => r.last_message_at);
    const alerts = await deps.db.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS} FROM alerts
        WHERE shop_id = $1 AND status = 'open' AND conversation_id = ANY($2::uuid[])
        ORDER BY created_at`,
      [shopId, page.map((r) => r.id)],
    );
    return c.json({
      conversations: page.map((r) => toConversationDTO(r, now)),
      alerts: alerts.rows.map(toAlertDTO),
      nextBefore,
    });
  });

  /** One page of messages, oldest first within the page; `before` goes further back. */
  app.get('/conversations/:id/messages', async (c) => {
    const id = uuidParam(c, 'id');
    const q = parseQuery(c, MessagesQuery);
    const shopId = c.var.shopId;
    const exists = await deps.db.query('SELECT 1 FROM conversations WHERE id = $1 AND shop_id = $2', [id, shopId]);
    if (exists.rowCount === 0) throw notFound();
    const res = await deps.db.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages
        WHERE conversation_id = $1 AND shop_id = $2
          AND ($3::timestamptz IS NULL OR created_at < $3)
        ORDER BY created_at DESC, id DESC
        LIMIT $4`,
      [id, shopId, q.before ?? null, q.limit + 1],
    );
    const { page, nextBefore } = cutPage(res.rows, q.limit, (r) => r.created_at);
    return c.json({ messages: page.reverse().map(toMessageDTO), nextBefore });
  });

  /**
   * The owner replies as the shop. `clientId` makes it retry-safe: sending the
   * same one again returns the stored message. Pauses the assistant.
   */
  app.post('/conversations/:id/messages', async (c) => {
    const id = uuidParam(c, 'id');
    const body = await parseBody(c, SendBody);
    const clientId = body.clientId.toLowerCase();
    const shopId = c.var.shopId;
    const now = deps.clock.now();

    const replay = async (row: MessageRow & { shop_id: string }) => {
      if (row.shop_id !== shopId || row.conversation_id !== id) {
        throw new ApiError(409, 'client_id_conflict', 'This clientId is already used by another message');
      }
      // The first request may have stored the message but failed to queue its send.
      if (row.status === 'queued') await enqueueSend(row.id);
      return c.json({ message: toMessageDTO(row), conversation: await requireConversation(deps.db, shopId, id, now) });
    };

    const existing = await findByClientId(deps.db, clientId);
    if (existing) return replay(existing);

    const conversation = await requireConversation(deps.db, shopId, id, now);
    if (!conversation.canReply) {
      throw new ApiError(
        409,
        'outside_reply_window',
        'Plus de 24 h depuis le dernier message du client : il doit vous réécrire',
      );
    }

    const message = await withTransaction(deps.db, async (tx) => {
      const inserted = await tx.query<MessageRow>(
        `INSERT INTO messages (shop_id, conversation_id, role, kind, text, status, client_id, created_at)
         VALUES ($1, $2, 'owner', 'text', $3, 'queued', $4, $5)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING ${MESSAGE_COLUMNS}`,
        [shopId, id, body.text, clientId, now],
      );
      const row = inserted.rows[0];
      if (!row) return null; // the same clientId was inserted meanwhile
      // Every owner message moves the pause forward (design doc « Taking over »).
      await tx.query(
        `UPDATE conversations c
            SET ai_paused_until = $3::timestamptz + make_interval(mins => s.takeover_minutes),
                last_message_at = GREATEST(c.last_message_at, $3)
           FROM shops s
          WHERE c.id = $1 AND c.shop_id = $2 AND s.id = c.shop_id`,
        [id, shopId, now],
      );
      // Same transaction: the message and its send job commit together.
      await enqueueSend(row.id, tx);
      return row;
    });
    if (!message) {
      const raced = await findByClientId(deps.db, clientId);
      if (!raced) throw new Error('message with this clientId vanished');
      return replay(raced);
    }

    return c.json(
      { message: toMessageDTO(message), conversation: await requireConversation(deps.db, shopId, id, now) },
      201,
    );
  });

  /** « Je prends la main »: the assistant stays silent for takeover_minutes. */
  app.post('/conversations/:id/takeover', async (c) => {
    const id = uuidParam(c, 'id');
    const shopId = c.var.shopId;
    const now = deps.clock.now();
    const res = await deps.db.query(
      `UPDATE conversations c
          SET ai_paused_until = $3::timestamptz + make_interval(mins => s.takeover_minutes)
         FROM shops s
        WHERE c.id = $1 AND c.shop_id = $2 AND s.id = c.shop_id`,
      [id, shopId, now],
    );
    if (res.rowCount === 0) throw notFound();
    return c.json({ conversation: await requireConversation(deps.db, shopId, id, now) });
  });

  /**
   * « Rendre la main »: the assistant answers the next customer message.
   * Messages that came during the pause were left to the owner, so none is
   * answered now.
   */
  app.post('/conversations/:id/release', async (c) => {
    const id = uuidParam(c, 'id');
    const shopId = c.var.shopId;
    const res = await deps.db.query(
      'UPDATE conversations SET ai_paused_until = NULL WHERE id = $1 AND shop_id = $2',
      [id, shopId],
    );
    if (res.rowCount === 0) throw notFound();
    return c.json({ conversation: await requireConversation(deps.db, shopId, id, deps.clock.now()) });
  });

  /** The owner opened the conversation: clears the unread count, marks its alert seen. */
  app.post('/conversations/:id/read', async (c) => {
    const id = uuidParam(c, 'id');
    const shopId = c.var.shopId;
    const now = deps.clock.now();
    const conversation = await withTransaction(deps.db, async (tx) => {
      await tx.query('UPDATE conversations SET unread_count = 0 WHERE id = $1 AND shop_id = $2 AND unread_count <> 0', [
        id,
        shopId,
      ]);
      await tx.query(
        `UPDATE alerts SET seen_at = $3
          WHERE conversation_id = $1 AND shop_id = $2 AND status = 'open' AND seen_at IS NULL`,
        [id, shopId, now],
      );
      return requireConversation(tx, shopId, id, now);
    });
    return c.json({ conversation });
  });

  /** Removes the alert from « À traiter ». Done again → 200, nothing changes. */
  app.post('/alerts/:id/done', async (c) => {
    const id = uuidParam(c, 'id');
    const shopId = c.var.shopId;
    const now = deps.clock.now();
    const alert = await withTransaction(deps.db, async (tx) => {
      const done = await tx.query<AlertRow>(
        `UPDATE alerts SET status = 'done', resolved_at = $3
          WHERE id = $1 AND shop_id = $2 AND status = 'open'
          RETURNING ${ALERT_COLUMNS}`,
        [id, shopId, now],
      );
      const row =
        done.rows[0] ??
        (await tx.query<AlertRow>(`SELECT ${ALERT_COLUMNS} FROM alerts WHERE id = $1 AND shop_id = $2`, [id, shopId]))
          .rows[0];
      if (!row) throw notFound();
      await tx.query(
        `UPDATE conversations c SET needs_attention = false
          WHERE c.id = $1 AND c.shop_id = $2 AND c.needs_attention
            AND NOT EXISTS (SELECT 1 FROM alerts a WHERE a.conversation_id = c.id AND a.status = 'open')`,
        [row.conversation_id, shopId],
      );
      return row;
    });
    const conversation = await requireConversation(deps.db, shopId, alert.conversation_id, now);
    return c.json({ alert: toAlertDTO(alert), conversation });
  });

  /** Push token of this device (this session). null turns pushes off. */
  app.put('/devices/current', async (c) => {
    const body = await parseBody(c, DeviceBody);
    const res = await deps.db.query(
      `UPDATE sessions SET push_token = $3, platform = COALESCE($4, platform), last_seen_at = $5
        WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL`,
      [c.var.sessionId, c.var.ownerId, body.pushToken, body.platform ?? null, deps.clock.now()],
    );
    if (res.rowCount === 0) throw new ApiError(401, 'unauthorized', 'Session expired');
    return c.body(null, 204);
  });

  async function enqueueSend(messageId: string, client?: DbClient): Promise<void> {
    // Keyed: a send that is still waiting isn't queued twice.
    await deps.jobs.enqueue(
      { kind: SEND_OWNER_MESSAGE_JOB, key: ownerSendJobKey(messageId), payload: { messageId } },
      client,
    );
  }

  return app;
}

async function findByClientId(db: DbClient, clientId: string): Promise<(MessageRow & { shop_id: string }) | null> {
  const res = await db.query<MessageRow & { shop_id: string }>(
    `SELECT ${MESSAGE_COLUMNS}, shop_id FROM messages WHERE client_id = $1`,
    [clientId],
  );
  return res.rows[0] ?? null;
}
