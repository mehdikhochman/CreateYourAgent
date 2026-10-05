/**
 * The 'send_owner_message' job: sends a message the owner wrote in the app
 * (stored 'queued' by POST /v1/conversations/:id/messages) on WhatsApp.
 * Safe to run twice: a message that already left is not sent again.
 */
import type { AppDeps } from '../deps';
import type { JobContext, JobHandler } from '../jobs/worker';
import { withAdvisoryLock } from './lock';
import { describeSendError } from './send-error';

export const SEND_OWNER_MESSAGE_JOB = 'send_owner_message';
export const ownerSendJobKey = (messageId: string) => `send_owner_message:${messageId}`;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type OwnerMessage = { id: string; text: string; status: string; wa_id: string; phone_number_id: string | null };

export function ownerSendJobHandler(deps: AppDeps): JobHandler {
  return async (payload, ctx) => {
    const messageId: unknown = payload?.messageId;
    if (typeof messageId !== 'string' || !UUID_RE.test(messageId)) {
      deps.log.error('owner send: invalid payload', { payload });
      return;
    }
    const ran = await withAdvisoryLock(deps.db, ownerSendJobKey(messageId), () => send(deps, messageId, ctx));
    // Another worker is sending it right now: retry later, it will most likely be 'sent' by then.
    if (!ran) throw new Error('message is being sent by another worker');
  };
}

async function send(deps: AppDeps, messageId: string, ctx: JobContext): Promise<void> {
  const res = await deps.db.query<OwnerMessage>(
    `SELECT m.id, m.text, m.status, cu.wa_id, ch.phone_number_id
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id AND c.shop_id = m.shop_id
       JOIN customers cu ON cu.id = c.customer_id
       LEFT JOIN channels ch ON ch.shop_id = m.shop_id AND ch.status = 'connected'
      WHERE m.id = $1 AND m.role = 'owner'`,
    [messageId],
  );
  const msg = res.rows[0];
  if (!msg) {
    deps.log.warn('owner send: message not found', { messageId });
    return;
  }
  if (msg.status !== 'queued') return; // already sent (or failed for good)
  if (!msg.phone_number_id) {
    await markFailed(deps, messageId, 'WhatsApp n’est pas connecté');
    return;
  }

  let wamid: string;
  try {
    ({ wamid } = await deps.whatsapp.sendText({ phoneNumberId: msg.phone_number_id, to: msg.wa_id, text: msg.text }));
  } catch (err) {
    const failure = describeSendError(err);
    if (!failure.permanent && ctx.attempt < ctx.maxAttempts) throw err;
    deps.log.error('owner send: could not send on WhatsApp', { messageId, error: failure.message });
    await markFailed(deps, messageId, failure.message);
    return;
  }
  await deps.db.query(
    `UPDATE messages SET status = 'sent', wamid = $2, error = NULL WHERE id = $1 AND status = 'queued'`,
    [messageId, wamid],
  );
}

async function markFailed(deps: AppDeps, messageId: string, error: string): Promise<void> {
  await deps.db.query(`UPDATE messages SET status = 'failed', error = $2 WHERE id = $1 AND status = 'queued'`, [
    messageId,
    error,
  ]);
}
