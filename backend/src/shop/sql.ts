/** SQL helpers shared by the shop routes. */
import type { DbClient } from '../db/pool';
import { ApiError } from '../http/errors';

/** Columns of CatalogItemRow (domain/api.ts). */
export const CATALOG_COLUMNS = 'id, name, price_fcfa, available, position, deleted_at, rev';
/** Columns of AnswerRow (domain/api.ts). */
export const ANSWER_COLUMNS = 'id, question, action, product_id, answer, source, deleted_at, rev';
/** Columns of MessageRow (domain/api.ts). */
export { MESSAGE_COLUMNS } from '../domain/api';
/** Columns of AlertRow (domain/api.ts). */
export const ALERT_COLUMNS = 'id, conversation_id, kind, summary, status, created_at, rev';

export const notFound = () => new ApiError(404, 'not_found', 'Not found');

/**
 * Locks the shop row until the transaction ends, so writes that check a
 * per-shop rule (catalogue size, one correction per message) don't race.
 * NO KEY UPDATE doesn't block inserts that reference the shop.
 */
export async function lockShop(tx: DbClient, shopId: string): Promise<void> {
  const res = await tx.query('SELECT 1 FROM shops WHERE id = $1 FOR NO KEY UPDATE', [shopId]);
  if (res.rowCount === 0) throw notFound();
}

/** No-op update: the trigger bumps shops.rev, so the app re-syncs the profile. */
export async function touchShop(db: DbClient, shopId: string): Promise<void> {
  await db.query('UPDATE shops SET name = name WHERE id = $1', [shopId]);
}

/**
 * Soft-deletes a row of this shop. Deleting an already deleted row succeeds
 * without bumping its rev (safe to retry); a row of another shop is a 404.
 */
export async function softDelete(
  db: DbClient,
  table: 'catalog_items' | 'learned_answers',
  input: { id: string; shopId: string; now: Date },
): Promise<void> {
  const res = await db.query(
    `UPDATE ${table} SET deleted_at = $3 WHERE id = $1 AND shop_id = $2 AND deleted_at IS NULL`,
    [input.id, input.shopId, input.now],
  );
  if (res.rowCount) return;
  const exists = await db.query(`SELECT 1 FROM ${table} WHERE id = $1 AND shop_id = $2`, [input.id, input.shopId]);
  if (exists.rowCount === 0) throw notFound();
}
