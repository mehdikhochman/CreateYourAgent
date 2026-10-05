import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL_DAYS = 180;

export type AccessClaims = { ownerId: string; shopId: string; sessionId: string };

const ISSUER = 'creetonagent';

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signAccessToken(secret: string, claims: AccessClaims, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ shop: claims.shopId, sid: claims.sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(claims.ownerId)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SECONDS)
    .sign(key(secret));
}

/** Returns the claims, or null if the token is invalid or expired at `now`. */
export async function verifyAccessToken(secret: string, token: string, now: Date): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      issuer: ISSUER,
      algorithms: ['HS256'],
      currentDate: now,
    });
    if (typeof payload.sub !== 'string' || typeof payload.shop !== 'string' || typeof payload.sid !== 'string') {
      return null;
    }
    return { ownerId: payload.sub, shopId: payload.shop, sessionId: payload.sid };
  } catch {
    return null;
  }
}

/** Opaque refresh token: random, stored only as a SHA-256 hash. */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
