import { randomUUID } from 'node:crypto';

import { hashRefreshToken, signAccessToken } from '../auth/tokens';
import type { Db } from '../db/pool';
import { TEST_JWT_SECRET } from './fakes';

export type SeededOwner = {
  ownerId: string;
  shopId: string;
  sessionId: string;
  phone: string;
  /** Access token valid at `now`. */
  token: string;
  /** Headers for app.request(): { Authorization: 'Bearer …' }. */
  headers: Record<string, string>;
};

/**
 * Creates an owner, their (empty) shop and a session directly in the database,
 * and signs an access token — without going through SMS login.
 */
export async function seedOwner(
  db: Db,
  opts: { phone?: string; firstName?: string; shopName?: string; now?: Date; pushToken?: string } = {},
): Promise<SeededOwner> {
  const phone = opts.phone ?? `+22507${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const now = opts.now ?? new Date('2026-10-05T10:00:00.000Z');
  const owner = await db.query<{ id: string }>(
    'INSERT INTO owners (phone, first_name) VALUES ($1, $2) RETURNING id',
    [phone, opts.firstName ?? 'Awa'],
  );
  const ownerId = owner.rows[0]!.id;
  const shop = await db.query<{ id: string }>('INSERT INTO shops (owner_id, name) VALUES ($1, $2) RETURNING id', [
    ownerId,
    opts.shopName ?? 'Awa Fashion',
  ]);
  const shopId = shop.rows[0]!.id;
  const session = await db.query<{ id: string }>(
    `INSERT INTO sessions (owner_id, refresh_hash, device_name, platform, push_token, expires_at)
     VALUES ($1, $2, 'test', 'ios', $3, $4) RETURNING id`,
    [ownerId, hashRefreshToken(randomUUID()), opts.pushToken ?? null, new Date(now.getTime() + 180 * 86_400_000)],
  );
  const sessionId = session.rows[0]!.id;
  const token = await signAccessToken(TEST_JWT_SECRET, { ownerId, shopId, sessionId }, now);
  return { ownerId, shopId, sessionId, phone, token, headers: { Authorization: `Bearer ${token}` } };
}

/** Fills a shop with the demo profile from the prototype (Awa Fashion) and returns catalog ids. */
export async function seedDemoProfile(db: Db, shopId: string): Promise<{ robeId: string; sacId: string }> {
  await db.query(
    `UPDATE shops SET
       category = 'boutique', hours = 'Lun–Sam · 9h–20h',
       delivery_fee = '1 500 F à Cocody, 2 000 F ailleurs',
       tiktok = '@awafashion225', instagram = '@awa.fashion',
       sales_channels = '{tiktok,instagram}', service_modes = '{livraison}',
       delivery_zones = '{Cocody,Yopougon}', payments = '{Wave,"Orange Money"}', tone = 'ivoirien'
     WHERE id = $1`,
    [shopId],
  );
  const robeId = randomUUID();
  const sacId = randomUUID();
  await db.query(
    `INSERT INTO catalog_items (id, shop_id, name, price_fcfa, position) VALUES
       ($1, $3, 'Robe pagne wax (taille S à XL)', 12000, 0),
       ($2, $3, 'Sac à main simili cuir', 8500, 1)`,
    [robeId, sacId, shopId],
  );
  return { robeId, sacId };
}

/** Links a WhatsApp number (Meta phone_number_id) to the shop. */
export async function seedChannel(db: Db, shopId: string, phoneNumberId = '1234567890'): Promise<void> {
  await db.query(
    `INSERT INTO channels (shop_id, phone_number_id, display_phone) VALUES ($1, $2, '+1 555 0100')`,
    [shopId, phoneNumberId],
  );
}
