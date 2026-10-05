/** GET /shop and PATCH /shop: the « Mon assistant » profile. */
import { Hono } from 'hono';
import { z } from 'zod';

import { withTransaction, type DbClient } from '../db/pool';
import type { AppDeps } from '../deps';
import { ABIDJAN_ZONES, SALES_CHANNELS } from '../domain/abidjan';
import {
  PROFILE_SQL,
  toAnswerDTO,
  toCatalogItemDTO,
  toProfileDTO,
  type AnswerRow,
  type CatalogItemRow,
  type ProfileDTO,
  type ProfileRow,
} from '../domain/api';
import { ApiError } from '../http/errors';
import type { AppEnv } from '../http/env';
import { parseBody } from '../http/validate';
import { ANSWER_COLUMNS, CATALOG_COLUMNS, notFound } from './sql';

const text = (max: number) => z.string().trim().max(max);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
/** Free-text chips (« Livraison », « Wave »…): trimmed, duplicates dropped. */
const freeList = z
  .array(z.string().trim().min(1).max(40))
  .max(10)
  .transform((values) => [...new Set(values)]);

const PatchShopBody = z
  .strictObject({
    ownerName: text(60),
    category: z.enum(['restaurant', 'boutique']).nullable(),
    name: text(80),
    location: text(200),
    hours: text(200),
    deliveryFee: text(200),
    tiktok: text(80),
    instagram: text(80),
    facebook: text(80),
    salesChannels: z.array(z.enum(SALES_CHANNELS)).refine(unique, 'Values must be unique'),
    serviceModes: freeList,
    deliveryZones: z.array(z.enum(ABIDJAN_ZONES)).refine(unique, 'Values must be unique'),
    payments: freeList,
    tone: z.enum(['formel', 'amical', 'ivoirien']),
    takeoverMinutes: z.number().int().min(5).max(1440),
  })
  .partial();
type PatchShop = z.infer<typeof PatchShopBody>;

/** Body field → shops column (ownerName lives in owners). */
const SHOP_COLUMNS: Record<Exclude<keyof PatchShop, 'ownerName'>, string> = {
  category: 'category',
  name: 'name',
  location: 'location',
  hours: 'hours',
  deliveryFee: 'delivery_fee',
  tiktok: 'tiktok',
  instagram: 'instagram',
  facebook: 'facebook',
  salesChannels: 'sales_channels',
  serviceModes: 'service_modes',
  deliveryZones: 'delivery_zones',
  payments: 'payments',
  tone: 'tone',
  takeoverMinutes: 'takeover_minutes',
};

export async function getProfile(db: DbClient, shopId: string): Promise<ProfileDTO> {
  const res = await db.query<ProfileRow>(PROFILE_SQL, [shopId]);
  const row = res.rows[0];
  if (!row) throw notFound();
  return toProfileDTO(row);
}

export function profileRoutes(deps: AppDeps): Hono<AppEnv> {
  const app = new Hono<AppEnv>();

  app.get('/shop', async (c) => {
    const shopId = c.var.shopId;
    const profile = await getProfile(deps.db, shopId);
    const [catalog, answers] = await Promise.all([
      deps.db.query<CatalogItemRow>(
        `SELECT ${CATALOG_COLUMNS} FROM catalog_items
          WHERE shop_id = $1 AND deleted_at IS NULL
          ORDER BY position, created_at, id`,
        [shopId],
      ),
      deps.db.query<AnswerRow>(
        `SELECT ${ANSWER_COLUMNS} FROM learned_answers
          WHERE shop_id = $1 AND deleted_at IS NULL
          ORDER BY created_at, id`,
        [shopId],
      ),
    ]);
    return c.json({
      profile,
      catalog: catalog.rows.map(toCatalogItemDTO),
      answers: answers.rows.map(toAnswerDTO),
    });
  });

  app.patch('/shop', async (c) => {
    const body = await parseBody(c, PatchShopBody);
    if (Object.keys(body).length === 0) throw new ApiError(400, 'invalid_request', 'Nothing to update');
    const shopId = c.var.shopId;

    const profile = await withTransaction(deps.db, async (tx) => {
      if (body.ownerName !== undefined) {
        await tx.query(
          `UPDATE owners o SET first_name = $1 FROM shops s WHERE s.id = $2 AND o.id = s.owner_id`,
          [body.ownerName, shopId],
        );
      }
      const sets: string[] = [];
      const values: unknown[] = [];
      for (const [field, column] of Object.entries(SHOP_COLUMNS)) {
        const value = body[field as keyof typeof SHOP_COLUMNS];
        if (value === undefined) continue;
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
      // Always update the shop row: its rev is the profile's rev (ownerName included).
      if (sets.length === 0) sets.push('name = name');
      values.push(shopId);
      const res = await tx.query(`UPDATE shops SET ${sets.join(', ')} WHERE id = $${values.length}`, values);
      if (res.rowCount === 0) throw notFound();
      return getProfile(tx, shopId);
    });
    return c.json({ profile });
  });

  return app;
}
