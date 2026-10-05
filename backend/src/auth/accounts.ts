import type { PoolClient } from 'pg';

/** Owner as returned by POST /v1/auth/verify. */
export type AuthOwnerDTO = { id: string; phone: string; firstName: string };

type OwnerRow = { id: string; phone: string; first_name: string };

const toAuthOwnerDTO = (r: OwnerRow): AuthOwnerDTO => ({ id: r.id, phone: r.phone, firstName: r.first_name });

/**
 * Finds the owner of `phone`, or creates them with their empty shop. Safe when
 * two logins of a new number race: the second insert waits on the unique
 * index, does nothing, and reads the first one's rows.
 */
export async function findOrCreateOwner(
  tx: PoolClient,
  phone: string,
  now: Date,
): Promise<{ owner: AuthOwnerDTO; shopId: string; isNew: boolean }> {
  const select = () =>
    tx.query<OwnerRow>('SELECT id, phone, first_name FROM owners WHERE phone = $1', [phone]);

  let owner = (await select()).rows[0];
  let isNew = false;
  if (!owner) {
    const inserted = await tx.query<OwnerRow>(
      `INSERT INTO owners (phone, created_at) VALUES ($1, $2)
       ON CONFLICT (phone) DO NOTHING
       RETURNING id, phone, first_name`,
      [phone, now],
    );
    owner = inserted.rows[0] ?? (await select()).rows[0];
    isNew = inserted.rows.length > 0;
  }
  if (!owner) throw new Error('findOrCreateOwner: owner vanished');

  const shopId = await ensureShop(tx, owner.id, now);
  return { owner: toAuthOwnerDTO(owner), shopId, isNew };
}

/** One owner = one shop in v1. Creates the empty shop if it doesn't exist yet. */
async function ensureShop(tx: PoolClient, ownerId: string, now: Date): Promise<string> {
  const select = () => tx.query<{ id: string }>('SELECT id FROM shops WHERE owner_id = $1', [ownerId]);

  const existing = (await select()).rows[0];
  if (existing) return existing.id;
  const inserted = await tx.query<{ id: string }>(
    `INSERT INTO shops (owner_id, created_at, updated_at) VALUES ($1, $2, $2)
     ON CONFLICT (owner_id) DO NOTHING
     RETURNING id`,
    [ownerId, now],
  );
  const shop = inserted.rows[0] ?? (await select()).rows[0];
  if (!shop) throw new Error('ensureShop: shop vanished');
  return shop.id;
}
