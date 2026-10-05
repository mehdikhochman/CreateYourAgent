/**
 * Learned answers: PUT/DELETE /shop/answers/:id (ids made by the app) and
 * POST /messages/:id/correction (« Corriger » under an assistant reply).
 */
import { randomUUID } from 'node:crypto';

import { Hono } from 'hono';
import { z } from 'zod';

import { withTransaction, type DbClient } from '../db/pool';
import type { AppDeps } from '../deps';
import { toAnswerDTO, type AnswerRow } from '../domain/api';
import { normalize } from '../domain/text';
import { ASSISTANT_ACTIONS, type AssistantAction } from '../domain/types';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody, uuidParam } from '../http/validate';
import { ANSWER_COLUMNS, lockShop, notFound, softDelete } from './sql';

export const MAX_QUESTION_LENGTH = 300;

const AnswerFields = {
  action: z.enum(ASSISTANT_ACTIONS),
  productId: z.guid().nullable().optional(),
  answer: z.string().trim().max(1000).optional(),
};
const AnswerBody = z.object({ question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH), ...AnswerFields });
const CorrectionBody = z.object(AnswerFields);

type AnswerInput = { action: AssistantAction; productId?: string | null; answer?: string };
type ResolvedAnswer = { action: AssistantAction; productId: string | null; answer: string };

/**
 * Checks what the action needs: 'price' a live product of this shop, 'custom'
 * the owner's words. productId is kept only for 'price'.
 */
async function resolveAnswer(db: DbClient, shopId: string, input: AnswerInput): Promise<ResolvedAnswer> {
  const answer = input.answer ?? '';
  if (input.action === 'custom' && answer === '') {
    throw new ApiError(400, 'answer_required', 'Écrivez la réponse que l’assistant doit envoyer.');
  }
  if (input.action !== 'price') return { action: input.action, productId: null, answer };

  const productId = input.productId?.toLowerCase();
  const found = productId
    ? await db.query('SELECT 1 FROM catalog_items WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL', [
        productId,
        shopId,
      ])
    : null;
  if (!productId || !found?.rowCount) {
    throw new ApiError(400, 'invalid_product', 'Choisissez un article de votre catalogue.');
  }
  return { action: input.action, productId, answer };
}

/** Normalized question; a question with no letters or digits can't be matched, so it is refused. */
function questionNorm(question: string): string {
  const norm = normalize(question);
  if (norm === '') throw new ApiError(400, 'invalid_question', 'La question doit contenir des mots.');
  return norm;
}

/**
 * Inserts or updates answer `id` of this shop and revives it if deleted.
 * `source` and `fromMessageId` are only set on insert. Returns null if the id
 * belongs to another shop.
 */
async function upsertAnswer(
  db: DbClient,
  input: {
    id: string;
    shopId: string;
    question: string;
    resolved: ResolvedAnswer;
    source: 'manual' | 'correction';
    fromMessageId: string | null;
  },
): Promise<AnswerRow | null> {
  const res = await db.query<AnswerRow>(
    `INSERT INTO learned_answers (id, shop_id, question, question_norm, action, product_id, answer, source, from_message_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (id) DO UPDATE SET
       question = EXCLUDED.question,
       question_norm = EXCLUDED.question_norm,
       action = EXCLUDED.action,
       product_id = EXCLUDED.product_id,
       answer = EXCLUDED.answer,
       deleted_at = NULL
     WHERE learned_answers.shop_id = EXCLUDED.shop_id
     RETURNING ${ANSWER_COLUMNS}`,
    [
      input.id,
      input.shopId,
      input.question,
      questionNorm(input.question),
      input.resolved.action,
      input.resolved.productId,
      input.resolved.answer,
      input.source,
      input.fromMessageId,
    ],
  );
  return res.rows[0] ?? null;
}

export function answerRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.put('/shop/answers/:id', async (c) => {
    const id = uuidParam(c, 'id');
    const body = await parseBody(c, AnswerBody);
    const shopId = c.var.shopId;
    const resolved = await resolveAnswer(deps.db, shopId, body);
    const row = await upsertAnswer(deps.db, {
      id,
      shopId,
      question: body.question,
      resolved,
      source: 'manual',
      fromMessageId: null,
    });
    if (!row) throw notFound();
    return c.json(toAnswerDTO(row));
  });

  app.delete('/shop/answers/:id', async (c) => {
    const id = uuidParam(c, 'id');
    await softDelete(deps.db, 'learned_answers', { id, shopId: c.var.shopId, now: deps.clock.now() });
    return c.body(null, 204);
  });

  /**
   * The question is the customer's latest message before the corrected reply.
   * One live correction per reply: correcting it again (or retrying the
   * request) updates the earlier one (200) instead of adding a duplicate (201).
   */
  app.post('/messages/:id/correction', async (c) => {
    const messageId = uuidParam(c, 'id');
    const body = await parseBody(c, CorrectionBody);
    const shopId = c.var.shopId;

    const result = await withTransaction(deps.db, async (tx) => {
      await lockShop(tx, shopId);
      const reply = await tx.query(
        `SELECT 1 FROM messages WHERE id = $1 AND shop_id = $2 AND role = 'assistant'`,
        [messageId, shopId],
      );
      if (reply.rowCount === 0) throw notFound();

      // Compared in SQL: timestamps keep their microseconds. rev breaks ties.
      const asked = await tx.query<{ text: string }>(
        `SELECT q.text
           FROM messages a
           JOIN messages q ON q.conversation_id = a.conversation_id AND q.shop_id = a.shop_id
                          AND q.role = 'customer'
                          AND (q.created_at < a.created_at OR (q.created_at = a.created_at AND q.rev < a.rev))
          WHERE a.id = $1 AND a.shop_id = $2
          ORDER BY q.created_at DESC, q.rev DESC
          LIMIT 1`,
        [messageId, shopId],
      );
      const question = (asked.rows[0]?.text ?? '').trim().slice(0, MAX_QUESTION_LENGTH);
      if (normalize(question) === '') {
        throw new ApiError(422, 'no_question', 'Aucune question du client avant cette réponse.');
      }

      const resolved = await resolveAnswer(tx, shopId, body);
      const earlier = await tx.query<{ id: string }>(
        `SELECT id FROM learned_answers
          WHERE shop_id = $1 AND from_message_id = $2 AND deleted_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
        [shopId, messageId],
      );
      const row = await upsertAnswer(tx, {
        id: earlier.rows[0]?.id ?? randomUUID(),
        shopId,
        question,
        resolved,
        source: 'correction',
        fromMessageId: messageId,
      });
      if (!row) throw notFound();
      return { row, created: earlier.rowCount === 0 };
    });
    return c.json(toAnswerDTO(result.row), result.created ? 201 : 200);
  });

  return app;
}
