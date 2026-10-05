import type { DbClient } from '../db/pool';
import { newRefreshToken, REFRESH_TOKEN_TTL_DAYS } from './tokens';

export type Platform = 'ios' | 'android' | 'web';

/** Creates a login session (one per device) and returns its id and refresh token. */
export async function createSession(
  db: DbClient,
  input: { ownerId: string; deviceName: string; platform: Platform | ''; now: Date },
): Promise<{ sessionId: string; refreshToken: string }> {
  const { token, hash } = newRefreshToken();
  const expiresAt = new Date(input.now.getTime() + REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  const res = await db.query<{ id: string }>(
    `INSERT INTO sessions (owner_id, refresh_hash, device_name, platform, created_at, last_seen_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $5, $6) RETURNING id`,
    [input.ownerId, hash, input.deviceName, input.platform, input.now, expiresAt],
  );
  return { sessionId: res.rows[0]!.id, refreshToken: token };
}

/**
 * Swaps a live refresh token for a new one. Atomic: the UPDATE matches the old
 * hash, so a token can be used only once even by parallel requests. Returns
 * null for an unknown, already used, revoked or expired token.
 */
export async function rotateRefreshToken(
  db: DbClient,
  oldHash: string,
  now: Date,
): Promise<{ sessionId: string; ownerId: string; shopId: string; refreshToken: string } | null> {
  const { token, hash } = newRefreshToken();
  const res = await db.query<{ id: string; owner_id: string; shop_id: string }>(
    `UPDATE sessions s
        SET refresh_hash = $2, last_seen_at = $3
       FROM shops sh
      WHERE s.refresh_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $3
        AND sh.owner_id = s.owner_id
     RETURNING s.id, s.owner_id, sh.id AS shop_id`,
    [oldHash, hash, now],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { sessionId: row.id, ownerId: row.owner_id, shopId: row.shop_id, refreshToken: token };
}

/** Revokes the session and forgets its push token. Idempotent. */
export async function revokeSession(
  db: DbClient,
  input: { sessionId: string; ownerId: string; now: Date },
): Promise<void> {
  await db.query(
    `UPDATE sessions SET revoked_at = COALESCE(revoked_at, $3), push_token = NULL
      WHERE id = $1 AND owner_id = $2`,
    [input.sessionId, input.ownerId, input.now],
  );
}
