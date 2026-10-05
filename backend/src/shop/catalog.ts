/** PUT/DELETE /shop/catalog/:id. Item ids are made by the app, so a retried PUT changes nothing new. */
import { Hono } from 'hono';
import { z } from 'zod';

import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import { toCatalogItemDTO, type CatalogItemRow } from '../domain/api';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody, uuidParam } from '../http/validate';
import { CATALOG_COLUMNS, lockShop, notFound, softDelete } from './sql';

export const MAX_CATALOG_ITEMS = 200;

const CatalogItemBody = z.object({
  name: z.string().trim().min(1).max(120),
  /** null = « prix sur demande ». */
  priceFcfa: z.number().int().min(0).max(10_000_000).nullable(),
  available: z.boolean().default(true),
  /** Omitted: appended at the end on create, unchanged on update. */
  position: z.number().int().min(0).max(1_000_000).optional(),
});

export function catalogRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.put('/shop/catalog/:id', async (c) => {
    const id = uuidParam(c, 'id');
    const body = await parseBody(c, CatalogItemBody);
    const shopId = c.var.shopId;

    const row = await withTransaction(deps.db, async (tx) => {
      await lockShop(tx, shopId);
      const existing = await tx.query<{ shop_id: string; deleted_at: Date | null }>(
        'SELECT shop_id, deleted_at FROM catalog_items WHERE id = $1',
        [id],
      );
      const current = existing.rows[0];
      if (current && current.shop_id !== shopId) throw notFound();

      // Creating or reviving an item adds one to the live catalogue.
      if (!current || current.deleted_at !== null) {
        const count = await tx.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM catalog_items WHERE shop_id = $1 AND deleted_at IS NULL',
          [shopId],
        );
        if ((count.rows[0]?.n ?? 0) >= MAX_CATALOG_ITEMS) {
          throw new ApiError(409, 'catalog_full', `Votre catalogue est plein (${MAX_CATALOG_ITEMS} articles maximum).`);
        }
      }

      // The WHERE on the conflict branch keeps another shop's row untouched
      // (no row returned → 404), even if it was inserted after the check above.
      const res = await tx.query<CatalogItemRow>(
        `INSERT INTO catalog_items (id, shop_id, name, price_fcfa, available, position)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6::int,
                 (SELECT COALESCE(MAX(position) + 1, 0) FROM catalog_items WHERE shop_id = $2 AND deleted_at IS NULL)))
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           price_fcfa = EXCLUDED.price_fcfa,
           available = EXCLUDED.available,
           position = COALESCE($6::int, catalog_items.position),
           deleted_at = NULL
         WHERE catalog_items.shop_id = EXCLUDED.shop_id
         RETURNING ${CATALOG_COLUMNS}`,
        [id, shopId, body.name, body.priceFcfa, body.available, body.position ?? null],
      );
      const saved = res.rows[0];
      if (!saved) throw notFound();
      return saved;
    });
    return c.json(toCatalogItemDTO(row));
  });

  app.delete('/shop/catalog/:id', async (c) => {
    const id = uuidParam(c, 'id');
    await softDelete(deps.db, 'catalog_items', { id, shopId: c.var.shopId, now: deps.clock.now() });
    return c.body(null, 204);
  });

  return app;
}
