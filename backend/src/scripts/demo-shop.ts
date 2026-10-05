/**
 * Demo data for local testing: Awa, her shop « Awa Fashion » (the prototype's
 * demo profile), four catalogue items and, if given, the link to a WhatsApp
 * number. Used by `npm run seed` (seed-demo.ts).
 *
 * Safe to run again: it reuses the owner and the shop, the items have ids
 * derived from the shop id, so nothing is duplicated. Running it again resets
 * the demo values; conversations, learned answers and the owner's other items
 * are kept.
 */
import { createHash } from 'node:crypto';

import type { PoolClient } from 'pg';

import { type Db, withTransaction } from '../db/pool';

export const DEMO_OWNER_NAME = 'Awa';
export const DEMO_SHOP_NAME = 'Awa Fashion';

/** Same values as seedDemoProfile in src/test/seed.ts. */
export const DEMO_PROFILE = {
  category: 'boutique',
  location: '',
  hours: 'Lun–Sam · 9h–20h',
  deliveryFee: '1 500 F à Cocody, 2 000 F ailleurs',
  tiktok: '@awafashion225',
  instagram: '@awa.fashion',
  facebook: '',
  salesChannels: ['tiktok', 'instagram'],
  serviceModes: ['livraison'],
  deliveryZones: ['Cocody', 'Yopougon'],
  payments: ['Wave', 'Orange Money'],
  tone: 'ivoirien',
  takeoverMinutes: 120,
} as const;

/** `key` never changes: the item's id is derived from it. */
export const DEMO_CATALOG = [
  { key: 'robe', name: 'Robe pagne wax (taille S à XL)', priceFcfa: 12000 },
  { key: 'sac', name: 'Sac à main simili cuir', priceFcfa: 8500 },
  { key: 'perruque', name: 'Perruque brésilienne', priceFcfa: 25000 },
  { key: 'chaussures', name: 'Chaussures dame', priceFcfa: 15000 },
] as const;

export type DemoSeedInput = {
  /** E.164, already normalized. */
  phone: string;
  /** Meta's id of the WhatsApp number. Omitted: the WhatsApp link is left as it is. */
  phoneNumberId?: string;
  /** Omitted: keeps the number already saved for this link, or ''. */
  displayPhone?: string;
};

export type Change = 'created' | 'updated' | 'unchanged';

export type DemoSeedResult = {
  ownerId: string;
  owner: Change;
  shopId: string;
  shop: 'created' | 'updated';
  catalog: { created: number; updated: number; unchanged: number };
  channel: null | {
    phoneNumberId: string;
    displayPhone: string;
    change: Change;
    /** The number was linked to another shop and was moved here. */
    movedFrom: { shopId: string; shopName: string } | null;
  };
};

/**
 * UUID v5 (RFC 4122): the same shop id and key always give the same uuid,
 * so re-running the seed updates the items instead of adding new ones.
 */
export function demoItemId(shopId: string, key: string): string {
  const namespace = Buffer.from(shopId.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1').update(namespace).update(`demo-catalog:${key}`).digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6]! & 0x0f) | 0x50; // version 5
  b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function seedDemoShop(db: Db, input: DemoSeedInput, now: Date): Promise<DemoSeedResult> {
  return withTransaction(db, async (tx) => {
    const { ownerId, owner } = await upsertOwner(tx, input.phone, now);
    const { shopId, shop } = await upsertShop(tx, ownerId, now);
    const catalog = await upsertCatalog(tx, shopId, now);
    const channel = input.phoneNumberId
      ? await linkChannel(tx, shopId, input.phoneNumberId, input.displayPhone, now)
      : null;
    return { ownerId, owner, shopId, shop, catalog, channel };
  });
}

async function upsertOwner(tx: PoolClient, phone: string, now: Date): Promise<{ ownerId: string; owner: Change }> {
  const found = await tx.query<{ id: string; first_name: string }>(
    'SELECT id, first_name FROM owners WHERE phone = $1',
    [phone],
  );
  const existing = found.rows[0];
  if (!existing) {
    const res = await tx.query<{ id: string }>(
      'INSERT INTO owners (phone, first_name, created_at) VALUES ($1, $2, $3) RETURNING id',
      [phone, DEMO_OWNER_NAME, now],
    );
    return { ownerId: res.rows[0]!.id, owner: 'created' };
  }
  if (existing.first_name === DEMO_OWNER_NAME) return { ownerId: existing.id, owner: 'unchanged' };
  await tx.query('UPDATE owners SET first_name = $2 WHERE id = $1', [existing.id, DEMO_OWNER_NAME]);
  return { ownerId: existing.id, owner: 'updated' };
}

/** One owner = one shop. Creates it if the owner never logged in, then writes the demo profile. */
async function upsertShop(
  tx: PoolClient,
  ownerId: string,
  now: Date,
): Promise<{ shopId: string; shop: 'created' | 'updated' }> {
  const found = await tx.query<{ id: string }>('SELECT id FROM shops WHERE owner_id = $1', [ownerId]);
  let shopId = found.rows[0]?.id;
  const shop = shopId ? 'updated' : 'created';
  if (!shopId) {
    const res = await tx.query<{ id: string }>(
      'INSERT INTO shops (owner_id, created_at) VALUES ($1, $2) RETURNING id',
      [ownerId, now],
    );
    shopId = res.rows[0]!.id;
  }
  const p = DEMO_PROFILE;
  // The update also bumps shops.rev, so a logged-in app re-syncs the profile.
  await tx.query(
    `UPDATE shops SET
       name = $2, category = $3, location = $4, hours = $5, delivery_fee = $6,
       tiktok = $7, instagram = $8, facebook = $9,
       sales_channels = $10, service_modes = $11, delivery_zones = $12, payments = $13,
       tone = $14, takeover_minutes = $15
     WHERE id = $1`,
    [
      shopId,
      DEMO_SHOP_NAME,
      p.category,
      p.location,
      p.hours,
      p.deliveryFee,
      p.tiktok,
      p.instagram,
      p.facebook,
      p.salesChannels,
      p.serviceModes,
      p.deliveryZones,
      p.payments,
      p.tone,
      p.takeoverMinutes,
    ],
  );
  return { shopId, shop };
}

type ItemRow = {
  id: string;
  name: string;
  price_fcfa: number | null;
  available: boolean;
  position: number;
  deleted_at: Date | null;
};

/** Creates the demo items, or puts them back to their demo values (un-deleting them if needed). */
async function upsertCatalog(tx: PoolClient, shopId: string, now: Date): Promise<DemoSeedResult['catalog']> {
  const ids = DEMO_CATALOG.map((item) => demoItemId(shopId, item.key));
  const found = await tx.query<ItemRow>(
    `SELECT id, name, price_fcfa, available, position, deleted_at
       FROM catalog_items WHERE shop_id = $1 AND id = ANY($2::uuid[])`,
    [shopId, ids],
  );
  const existing = new Map(found.rows.map((r) => [r.id, r]));

  const counts = { created: 0, updated: 0, unchanged: 0 };
  for (const [position, item] of DEMO_CATALOG.entries()) {
    const id = ids[position]!;
    const row = existing.get(id);
    if (!row) {
      await tx.query(
        `INSERT INTO catalog_items (id, shop_id, name, price_fcfa, available, position, created_at)
         VALUES ($1, $2, $3, $4, true, $5, $6)`,
        [id, shopId, item.name, item.priceFcfa, position, now],
      );
      counts.created += 1;
    } else if (
      row.name === item.name &&
      row.price_fcfa === item.priceFcfa &&
      row.available &&
      row.position === position &&
      row.deleted_at === null
    ) {
      counts.unchanged += 1;
    } else {
      await tx.query(
        `UPDATE catalog_items
            SET name = $3, price_fcfa = $4, available = true, position = $5, deleted_at = NULL
          WHERE id = $1 AND shop_id = $2`,
        [id, shopId, item.name, item.priceFcfa, position],
      );
      counts.updated += 1;
    }
  }
  return counts;
}

/**
 * Links the WhatsApp number to the shop. A phone_number_id belongs to one shop
 * only: if another shop holds it (e.g. an earlier demo account), it is moved.
 */
async function linkChannel(
  tx: PoolClient,
  shopId: string,
  phoneNumberId: string,
  displayPhone: string | undefined,
  now: Date,
): Promise<NonNullable<DemoSeedResult['channel']>> {
  const holder = (
    await tx.query<{ shop_id: string; shop_name: string; display_phone: string }>(
      `SELECT ch.shop_id, s.name AS shop_name, ch.display_phone
         FROM channels ch JOIN shops s ON s.id = ch.shop_id
        WHERE ch.phone_number_id = $1`,
      [phoneNumberId],
    )
  ).rows[0];
  const display = displayPhone ?? holder?.display_phone ?? '';

  let movedFrom: { shopId: string; shopName: string } | null = null;
  if (holder && holder.shop_id !== shopId) {
    await tx.query('DELETE FROM channels WHERE phone_number_id = $1', [phoneNumberId]);
    // No-op update: bumps that shop's rev, so its app sees WhatsApp as disconnected.
    await tx.query('UPDATE shops SET name = name WHERE id = $1', [holder.shop_id]);
    movedFrom = { shopId: holder.shop_id, shopName: holder.shop_name };
  }

  const row = (
    await tx.query<{ phone_number_id: string; display_phone: string; status: string }>(
      'SELECT phone_number_id, display_phone, status FROM channels WHERE shop_id = $1',
      [shopId],
    )
  ).rows[0];
  if (row && row.phone_number_id === phoneNumberId && row.display_phone === display && row.status === 'connected') {
    return { phoneNumberId, displayPhone: display, change: 'unchanged', movedFrom };
  }
  await tx.query(
    `INSERT INTO channels (shop_id, phone_number_id, display_phone, status, connected_at)
     VALUES ($1, $2, $3, 'connected', $4)
     ON CONFLICT (shop_id) DO UPDATE SET
       phone_number_id = EXCLUDED.phone_number_id,
       display_phone = EXCLUDED.display_phone,
       status = 'connected',
       connected_at = EXCLUDED.connected_at`,
    [shopId, phoneNumberId, display, now],
  );
  return { phoneNumberId, displayPhone: display, change: row ? 'updated' : 'created', movedFrom };
}
