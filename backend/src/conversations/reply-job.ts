/**
 * The 'reply' job (design doc §4): answers a conversation's pending burst of
 * customer messages on WhatsApp, or tells the owner when they have taken over.
 *
 * Safe to run twice: an answered burst is skipped, and a reply stored by an
 * attempt whose send failed is re-sent as is (the assistant isn't asked again).
 *
 * Which messages are pending: the customer messages after the last point the
 * conversation was answered up to. That point is the newest of
 *  - an owner message (the owner answered),
 *  - for an assistant reply, the customer message it answers (engine.replyTo),
 *    so a message that arrived while the reply was being written still counts,
 *  - a customer message flagged engine.skipped (it came while the owner had
 *    taken over, and the owner was notified instead).
 * A reply still 'queued' doesn't count: its send is pending.
 */
import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import { loadShopProfile } from '../domain/profile-repo';
import type { AlertInfo, AssistantReply, ChatTurn } from '../engine/types';
import type { JobContext, JobHandler } from '../jobs/worker';
import { raiseAlert } from './alerts';
import { withAdvisoryLock } from './lock';
import { customerLabel, excerpt, messagePreview, notifyOwner } from './notify';
import { describeSendError } from './send-error';

export const REPLY_JOB = 'reply';
/** Same key as the webhook uses, so a burst and a retry share one waiting job. */
export const replyJobKey = (conversationId: string) => `reply:${conversationId}`;

export const HOLDING_TEXT = 'Merci pour votre message ! Je préviens le responsable, il vous répond très vite.';
export const FALLBACK_TEXT = 'Je transmets votre question au responsable, il vous répond très vite.';
const HISTORY_SIZE = 10;
const BUSY_RETRY_MS = 3_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Conversation = {
  id: string;
  shop_id: string;
  ai_paused_until: Date | null;
  wa_id: string;
  customer_name: string;
  phone_number_id: string | null;
};

type PendingMessage = { id: string; kind: string; text: string; wamid: string | null };

/** What messages.engine holds for an assistant reply: the engine meta plus what a re-send needs. */
type ReplyEngine = Record<string, unknown> & { confident: boolean; alert: AlertInfo | null; replyTo: string };

type StoredReply = { id: string; text: string; engine: ReplyEngine };

export function replyJobHandler(deps: AppDeps): JobHandler {
  return async (payload, ctx) => {
    const conversationId: unknown = payload?.conversationId;
    if (typeof conversationId !== 'string' || !UUID_RE.test(conversationId)) {
      deps.log.error('reply: invalid payload', { payload });
      return;
    }
    const ran = await withAdvisoryLock(deps.db, replyJobKey(conversationId), () =>
      answerConversation(deps, conversationId, ctx),
    );
    if (!ran) {
      // Another worker is answering this conversation; come back once it's done.
      await deps.jobs.enqueue({
        kind: REPLY_JOB,
        key: replyJobKey(conversationId),
        payload: { conversationId },
        runAt: new Date(deps.clock.now().getTime() + BUSY_RETRY_MS),
      });
    }
  };
}

async function answerConversation(deps: AppDeps, conversationId: string, ctx: JobContext): Promise<void> {
  const conv = await loadConversation(deps, conversationId);
  if (!conv) {
    deps.log.warn('reply: conversation not found', { conversationId });
    return;
  }
  if (!conv.phone_number_id) {
    deps.log.warn('reply: the shop has no connected WhatsApp number', { conversationId, shopId: conv.shop_id });
    return;
  }

  const pending = await loadPending(deps, conversationId);
  const last = pending.at(-1);
  if (!last) return; // already answered

  const now = deps.clock.now();
  if (conv.ai_paused_until && conv.ai_paused_until.getTime() > now.getTime()) {
    await notifyPaused(deps, conv, pending, last);
    return;
  }

  const reply =
    (await takeQueuedReply(deps, conversationId, pending, last)) ??
    (await composeReply(deps, conv, conv.phone_number_id, pending, last, ctx));
  if (!reply) return;

  const sent = await deliver(deps, conv, conv.phone_number_id, reply, ctx);
  if (!sent) return;

  const { confident, alert } = reply.engine;
  if (!confident || alert) {
    await raiseAlert(deps, {
      shopId: conv.shop_id,
      conversationId,
      messageId: reply.id,
      kind: alert?.kind ?? 'question',
      summary: alert?.summary || defaultSummary(pending),
      customer: customerLabel(conv.customer_name, conv.wa_id),
    });
  }
}

async function loadConversation(deps: AppDeps, conversationId: string): Promise<Conversation | null> {
  const res = await deps.db.query<Conversation>(
    `SELECT c.id, c.shop_id, c.ai_paused_until, cu.wa_id, cu.display_name AS customer_name, ch.phone_number_id
       FROM conversations c
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN channels ch ON ch.shop_id = c.shop_id AND ch.status = 'connected'
      WHERE c.id = $1`,
    [conversationId],
  );
  return res.rows[0] ?? null;
}

/** Customer messages not answered yet, oldest first (see the comment at the top). */
async function loadPending(deps: AppDeps, conversationId: string): Promise<PendingMessage[]> {
  const res = await deps.db.query<PendingMessage>(
    `WITH marks AS (
       SELECT m.created_at, m.id
         FROM messages m
        WHERE m.conversation_id = $1
          AND (m.role = 'owner' OR (m.role = 'customer' AND m.engine->>'skipped' IS NOT NULL))
       UNION ALL
       SELECT COALESCE(q.created_at, a.created_at), COALESCE(q.id, a.id)
         FROM messages a
         LEFT JOIN messages q ON q.conversation_id = $1 AND q.id::text = a.engine->>'replyTo'
        WHERE a.conversation_id = $1 AND a.role = 'assistant' AND a.status <> 'queued'
     ), last_mark AS (
       SELECT created_at, id FROM marks ORDER BY created_at DESC, id DESC LIMIT 1
     )
     SELECT m.id, m.kind, m.text, m.wamid
       FROM messages m
      WHERE m.conversation_id = $1 AND m.role = 'customer'
        AND NOT EXISTS (SELECT 1 FROM last_mark l WHERE (m.created_at, m.id) <= (l.created_at, l.id))
      ORDER BY m.created_at, m.id`,
    [conversationId],
  );
  return res.rows;
}

/** The owner has taken over: no reply, the owner gets a push instead. */
async function notifyPaused(
  deps: AppDeps,
  conv: Conversation,
  pending: PendingMessage[],
  last: PendingMessage,
): Promise<void> {
  const ids = pending.map((m) => m.id);
  // Flagged so the assistant won't answer them after the pause: the owner handles them.
  await deps.db.query(
    `UPDATE messages SET engine = COALESCE(engine, '{}'::jsonb) || '{"skipped": "ai_paused"}'::jsonb
      WHERE id = ANY($1::uuid[]) AND conversation_id = $2 AND role = 'customer'`,
    [ids, conv.id],
  );
  // A reply to these that an earlier attempt couldn't send stays unsent.
  await deps.db.query(
    `UPDATE messages SET status = 'failed', error = 'Non envoyé : vous avez pris la main'
      WHERE conversation_id = $1 AND role = 'assistant' AND status = 'queued' AND engine->>'replyTo' = ANY($2::text[])`,
    [conv.id, ids],
  );
  await notifyOwner(deps, conv.shop_id, {
    title: customerLabel(conv.customer_name, conv.wa_id),
    body: `Nouveau message : ${messagePreview(last)}`,
    data: { conversationId: conv.id, type: 'message' },
  });
}

/**
 * A previous attempt stored a reply to this burst but couldn't send it: send
 * that one again. A queued reply to only part of the burst (the customer wrote
 * again since) is dropped, and the whole burst is answered afresh.
 */
async function takeQueuedReply(
  deps: AppDeps,
  conversationId: string,
  pending: PendingMessage[],
  last: PendingMessage,
): Promise<StoredReply | null> {
  const res = await deps.db.query<StoredReply>(
    `SELECT id, text, engine FROM messages
      WHERE conversation_id = $1 AND role = 'assistant' AND status = 'queued'
        AND engine->>'replyTo' = ANY($2::text[])
      ORDER BY created_at DESC, id DESC`,
    [conversationId, pending.map((m) => m.id)],
  );
  const current = res.rows.find((r) => r.engine.replyTo === last.id) ?? null;
  const stale = res.rows.filter((r) => r !== current).map((r) => r.id);
  if (stale.length > 0) {
    await deps.db.query(
      `UPDATE messages SET status = 'failed', error = 'Non envoyé : remplacé par une réponse plus récente'
        WHERE id = ANY($1::uuid[]) AND status = 'queued'`,
      [stale],
    );
  }
  return current;
}

/** Asks the assistant (or builds the holding reply for media) and stores the reply as 'queued'. */
async function composeReply(
  deps: AppDeps,
  conv: Conversation,
  phoneNumberId: string,
  pending: PendingMessage[],
  last: PendingMessage,
  ctx: JobContext,
): Promise<StoredReply | null> {
  if (last.wamid) {
    await deps.whatsapp.markRead({ phoneNumberId, wamid: last.wamid, typing: true }).catch((err: unknown) => {
      deps.log.warn('reply: markRead failed', { conversationId: conv.id, error: errorText(err) });
    });
  }

  const texts = pending.filter((m) => m.kind === 'text' && m.text.trim() !== '').map((m) => m.text.trim());
  let reply: AssistantReply;
  let meta: Record<string, unknown>;
  if (texts.length === 0) {
    // Voice notes, photos, stickers: not understood in v1, the owner takes it from here.
    reply = { text: HOLDING_TEXT, confident: false, alert: { kind: 'question', summary: mediaSummary(pending) } };
    meta = { action: 'holding', source: 'rule' };
  } else {
    const profile = await loadShopProfile(deps.db, conv.shop_id);
    if (!profile) {
      deps.log.warn('reply: shop not found', { conversationId: conv.id, shopId: conv.shop_id });
      return null;
    }
    const history = await loadHistory(deps, conv.id, pending);
    try {
      const result = await deps.assistant.respond({ profile, history, message: texts.join('\n') });
      reply = result.reply;
      meta = result.meta;
    } catch (err) {
      if (ctx.attempt < ctx.maxAttempts) throw err;
      // Never stay silent: on the last attempt, hand over to the owner.
      reply = { text: FALLBACK_TEXT, confident: false };
      meta = { action: 'fallback', source: 'fallback', error: errorText(err) };
    }
  }

  const engine: ReplyEngine = { ...meta, confident: reply.confident, alert: reply.alert ?? null, replyTo: last.id };
  const now = deps.clock.now();
  const id = await withTransaction(deps.db, async (tx) => {
    const inserted = await tx.query<{ id: string }>(
      `INSERT INTO messages (shop_id, conversation_id, role, kind, text, status, engine, created_at)
       VALUES ($1, $2, 'assistant', 'text', $3, 'queued', $4, $5)
       RETURNING id`,
      [conv.shop_id, conv.id, reply.text, JSON.stringify(engine), now],
    );
    await tx.query(`UPDATE conversations SET last_message_at = GREATEST(last_message_at, $2) WHERE id = $1`, [
      conv.id,
      now,
    ]);
    return inserted.rows[0]!.id;
  });
  return { id, text: reply.text, engine };
}

/** The 10 latest messages outside the burst, oldest first. Unsent replies are left out. */
async function loadHistory(deps: AppDeps, conversationId: string, pending: PendingMessage[]): Promise<ChatTurn[]> {
  const res = await deps.db.query<{ role: ChatTurn['role']; kind: string; text: string }>(
    `SELECT role, kind, text FROM messages
      WHERE conversation_id = $1 AND id <> ALL($2::uuid[])
        AND status <> 'failed' AND NOT (role = 'assistant' AND status = 'queued')
      ORDER BY created_at DESC, id DESC
      LIMIT $3`,
    [conversationId, pending.map((m) => m.id), HISTORY_SIZE],
  );
  return res.rows.reverse().map((r) => ({ role: r.role, text: messagePreview(r) }));
}

/**
 * Sends the stored reply. Returns false when it failed for good (marked
 * 'failed', owner alerted). Throws to retry while attempts are left.
 */
async function deliver(
  deps: AppDeps,
  conv: Conversation,
  phoneNumberId: string,
  reply: StoredReply,
  ctx: JobContext,
): Promise<boolean> {
  let wamid: string;
  try {
    ({ wamid } = await deps.whatsapp.sendText({ phoneNumberId, to: conv.wa_id, text: reply.text }));
  } catch (err) {
    const failure = describeSendError(err);
    if (!failure.permanent && ctx.attempt < ctx.maxAttempts) throw err;
    deps.log.error('reply: could not send on WhatsApp', { conversationId: conv.id, error: errorText(err) });
    await deps.db.query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1 AND status = 'queued'`, [
      reply.id,
      failure.message,
    ]);
    await raiseAlert(deps, {
      shopId: conv.shop_id,
      conversationId: conv.id,
      messageId: reply.id,
      kind: 'question',
      summary: 'Réponse non envoyée',
      customer: customerLabel(conv.customer_name, conv.wa_id),
    });
    return false;
  }
  await deps.db.query(
    `UPDATE messages SET status = 'sent', wamid = $2, error = NULL WHERE id = $1 AND status = 'queued'`,
    [reply.id, wamid],
  );
  deps.log.info('reply: sent', { conversationId: conv.id, messageId: reply.id });
  return true;
}

function mediaSummary(pending: PendingMessage[]): string {
  if (pending.some((m) => m.kind === 'audio')) return 'Note vocale reçue';
  if (pending.some((m) => m.kind === 'image')) return 'Photo reçue';
  return 'Message reçu';
}

/** Summary when the engine is unsure but gave none: the customer's own words. */
function defaultSummary(pending: PendingMessage[]): string {
  const asked = pending.map(messagePreview).join(' ');
  return `À vérifier : « ${excerpt(asked, 80)} »`;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
