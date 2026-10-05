/**
 * « À traiter »: a conversation has at most one open alert (unique index). A
 * new one updates it instead of piling up, but an order is never replaced by
 * a question.
 */
import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import type { AlertKind } from '../domain/types';
import { notifyOwner } from './notify';

export type RaiseAlertInput = {
  shopId: string;
  conversationId: string;
  messageId: string | null;
  kind: AlertKind;
  summary: string;
  /** Name or phone shown in the push. */
  customer: string;
};

/**
 * Opens (or updates) the conversation's alert, flags the conversation, and
 * pushes it to the owner. Returns the alert id.
 */
export async function raiseAlert(deps: AppDeps, input: RaiseAlertInput): Promise<string> {
  const now = deps.clock.now();
  const alertId = await withTransaction(deps.db, async (tx) => {
    const upserted = await tx.query<{ id: string }>(
      `INSERT INTO alerts (shop_id, conversation_id, message_id, kind, summary, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (conversation_id) WHERE status = 'open' DO UPDATE
         SET kind = EXCLUDED.kind, summary = EXCLUDED.summary, message_id = EXCLUDED.message_id, seen_at = NULL
         WHERE NOT (alerts.kind = 'order' AND EXCLUDED.kind = 'question')
       RETURNING id`,
      [input.shopId, input.conversationId, input.messageId, input.kind, input.summary, now],
    );
    // Nothing returned: an open order was kept as is (the conflicting row is locked, so it is still open).
    const id =
      upserted.rows[0]?.id ??
      (
        await tx.query<{ id: string }>(`SELECT id FROM alerts WHERE conversation_id = $1 AND status = 'open'`, [
          input.conversationId,
        ])
      ).rows[0]?.id;
    if (!id) throw new Error(`alert upsert found no open alert for conversation ${input.conversationId}`);
    await tx.query(
      `UPDATE conversations SET needs_attention = true WHERE id = $1 AND shop_id = $2 AND NOT needs_attention`,
      [input.conversationId, input.shopId],
    );
    return id;
  });

  const pushed = await notifyOwner(deps, input.shopId, {
    title: input.kind === 'order' ? 'Commande' : 'Question',
    body: `${input.customer} — ${input.summary}`,
    data: { conversationId: input.conversationId, alertId, type: 'alert' },
  });
  if (pushed > 0) await deps.db.query('UPDATE alerts SET pushed_at = $2 WHERE id = $1', [alertId, now]);
  return alertId;
}
