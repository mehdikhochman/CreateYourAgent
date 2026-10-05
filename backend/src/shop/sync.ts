/**
 * GET /sync?cursor=<rev>&limit=<n>: everything of this shop whose rev is above
 * the cursor, oldest change first, at most `limit` rows per page.
 *
 * Every synced row takes its rev from one global sequence, so revs never tie
 * across tables. Each table gives its first limit+1 rows above the cursor; the
 * page keeps the `limit` lowest revs of all of them, and the new cursor is the
 * rev of the last row kept. hasMore says whether rows were left out.
 *
 * All queries read one snapshot (REPEATABLE READ), so a row changed while we
 * read can't be skipped by the page.
 *
 * Known limitation: rev is taken when a row is written, not when its
 * transaction commits. If a transaction holding rev 10 commits after one
 * holding rev 11, a client that synced in between moves its cursor to 11 and
 * never sees rev 10. Rare with our short transactions; fix later with a
 * commit-time watermark (e.g. only return revs below the oldest rev still in
 * flight).
 */
import { Hono } from 'hono';
import { z } from 'zod';

import { withTransaction, type Db } from '../db/pool';
import {
  CONVERSATION_SELECT,
  PROFILE_SQL,
  toAlertDTO,
  toAnswerDTO,
  toCatalogItemDTO,
  toConversationDTO,
  toMessageDTO,
  toProfileDTO,
  type AlertDTO,
  type AlertRow,
  type AnswerDTO,
  type AnswerRow,
  type CatalogItemDTO,
  type CatalogItemRow,
  type ConversationDTO,
  type ConversationRow,
  type MessageDTO,
  type MessageRow,
  type ProfileDTO,
  type ProfileRow,
} from '../domain/api';
import type { AppDeps } from '../deps';
import type { AppEnv } from '../http/env';
import { parseQuery } from '../http/validate';
import { ALERT_COLUMNS, ANSWER_COLUMNS, CATALOG_COLUMNS, MESSAGE_COLUMNS } from './sql';

export const SYNC_DEFAULT_LIMIT = 200;
export const SYNC_MAX_LIMIT = 500;

const SyncQuery = z.object({
  cursor: z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
  limit: z.coerce.number().int().min(1).max(SYNC_MAX_LIMIT).default(SYNC_DEFAULT_LIMIT),
});

export type SyncPage = {
  cursor: number;
  hasMore: boolean;
  /** Set when the profile changed (fields, owner name or WhatsApp link). */
  profile: ProfileDTO | null;
  /** Deleted items and answers come with deleted: true, so the app removes them. */
  catalog: CatalogItemDTO[];
  answers: AnswerDTO[];
  conversations: ConversationDTO[];
  messages: MessageDTO[];
  alerts: AlertDTO[];
};

type Change =
  | { kind: 'profile'; dto: ProfileDTO }
  | { kind: 'catalog'; dto: CatalogItemDTO }
  | { kind: 'answers'; dto: AnswerDTO }
  | { kind: 'conversations'; dto: ConversationDTO }
  | { kind: 'messages'; dto: MessageDTO }
  | { kind: 'alerts'; dto: AlertDTO };

/** Reads one page of changes of `shopId` after `cursor`. */
export async function readChanges(
  db: Db,
  input: { shopId: string; cursor: number; limit: number; now: Date },
): Promise<SyncPage> {
  const { shopId, cursor, limit, now } = input;
  const params = [shopId, cursor, limit + 1];

  const changes = await withTransaction(db, async (tx) => {
    await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
    const profile = await tx.query<ProfileRow>(`${PROFILE_SQL} AND s.rev > $2`, [shopId, cursor]);
    const catalog = await tx.query<CatalogItemRow>(
      `SELECT ${CATALOG_COLUMNS} FROM catalog_items WHERE shop_id = $1 AND rev > $2 ORDER BY rev LIMIT $3`,
      params,
    );
    const answers = await tx.query<AnswerRow>(
      `SELECT ${ANSWER_COLUMNS} FROM learned_answers WHERE shop_id = $1 AND rev > $2 ORDER BY rev LIMIT $3`,
      params,
    );
    const conversations = await tx.query<ConversationRow>(
      `${CONVERSATION_SELECT} WHERE c.shop_id = $1 AND c.rev > $2 ORDER BY c.rev LIMIT $3`,
      params,
    );
    const messages = await tx.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE shop_id = $1 AND rev > $2 ORDER BY rev LIMIT $3`,
      params,
    );
    const alerts = await tx.query<AlertRow>(
      `SELECT ${ALERT_COLUMNS} FROM alerts WHERE shop_id = $1 AND rev > $2 ORDER BY rev LIMIT $3`,
      params,
    );
    return [
      ...profile.rows.map((r): Change => ({ kind: 'profile', dto: toProfileDTO(r) })),
      ...catalog.rows.map((r): Change => ({ kind: 'catalog', dto: toCatalogItemDTO(r) })),
      ...answers.rows.map((r): Change => ({ kind: 'answers', dto: toAnswerDTO(r) })),
      ...conversations.rows.map((r): Change => ({ kind: 'conversations', dto: toConversationDTO(r, now) })),
      ...messages.rows.map((r): Change => ({ kind: 'messages', dto: toMessageDTO(r) })),
      ...alerts.rows.map((r): Change => ({ kind: 'alerts', dto: toAlertDTO(r) })),
    ];
  });

  changes.sort((a, b) => a.dto.rev - b.dto.rev);
  const kept = changes.slice(0, limit);
  const page: SyncPage = {
    cursor: kept.at(-1)?.dto.rev ?? cursor,
    hasMore: changes.length > limit,
    profile: null,
    catalog: [],
    answers: [],
    conversations: [],
    messages: [],
    alerts: [],
  };
  for (const change of kept) {
    switch (change.kind) {
      case 'profile':
        page.profile = change.dto;
        break;
      case 'catalog':
        page.catalog.push(change.dto);
        break;
      case 'answers':
        page.answers.push(change.dto);
        break;
      case 'conversations':
        page.conversations.push(change.dto);
        break;
      case 'messages':
        page.messages.push(change.dto);
        break;
      case 'alerts':
        page.alerts.push(change.dto);
        break;
    }
  }
  return page;
}

export function syncRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/sync', async (c) => {
    const query = parseQuery(c, SyncQuery);
    const page = await readChanges(deps.db, {
      shopId: c.var.shopId,
      cursor: query.cursor,
      limit: query.limit,
      now: deps.clock.now(),
    });
    return c.json(page);
  });

  return app;
}
