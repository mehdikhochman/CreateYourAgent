/**
 * SMS login codes: creation, rate limits and checking.
 *
 * A code is 6 digits, valid 10 minutes, stored only as
 * HMAC-SHA256(otpSecret, phone + ':' + code). Only the phone's latest code
 * works: issuing a new one expires the previous ones.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import type { PoolClient } from 'pg';

import type { Config } from '../config';
import { withTransaction } from '../db/pool';
import type { AppDeps } from '../deps';
import { normalizePhone } from '../domain/phone';

export const OTP_TTL_MS = 10 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_PER_PHONE_LIMIT = 3;
export const OTP_PER_PHONE_WINDOW_MS = 15 * 60_000;
export const OTP_PER_IP_LIMIT = 10;
export const OTP_PER_IP_WINDOW_MS = 60 * 60_000;

/** Namespace for pg_advisory_xact_lock(ns, hashtext(phone)), so other modules' locks never collide. */
const PHONE_LOCK_NS = 0x07b0;

export function generateCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export function hashCode(secret: string, phone: string, code: string): string {
  return createHmac('sha256', secret).update(`${phone}:${code}`).digest('hex');
}

/** Constant-time comparison of `code` with a stored hash. */
export function codeMatches(secret: string, phone: string, code: string, storedHash: string): boolean {
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashCode(secret, phone, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function smsText(code: string): string {
  return `${code} est votre code CréeTonAgent. Il expire dans 10 minutes.`;
}

/** Fixed code for a test number (App Store review), or undefined. */
export function testCodeFor(config: Pick<Config, 'authTestCodes'>, phone: string): string | undefined {
  const direct = config.authTestCodes.get(phone);
  if (direct) return direct;
  for (const [p, code] of config.authTestCodes) {
    if (normalizePhone(p) === phone) return code;
  }
  return undefined;
}

/**
 * In-memory sliding-window limiter (per process). Enough for one API instance
 * in stage 1; move to Postgres or Redis when there are several.
 */
export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();
  private lastSweep = 0;

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Records a hit for `key` and returns true, or returns false if `key` is over the limit. */
  hit(key: string, now: Date): boolean {
    const t = now.getTime();
    if (this.hits.size > 10_000 && t - this.lastSweep > 60_000) this.sweep(t);
    const recent = (this.hits.get(key) ?? []).filter((at) => at > t - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    return true;
  }

  reset(): void {
    this.hits.clear();
    this.lastSweep = 0;
  }

  /** Forgets keys with no recent hit, so stale IPs do not pile up. */
  private sweep(t: number) {
    this.lastSweep = t;
    for (const [key, times] of this.hits) {
      if (!times.some((at) => at > t - this.windowMs)) this.hits.delete(key);
    }
  }
}

export function newIpLimiter(): SlidingWindowLimiter {
  return new SlidingWindowLimiter(OTP_PER_IP_LIMIT, OTP_PER_IP_WINDOW_MS);
}

/** Expires the phone's live codes and stores a new one. Returns its id. */
async function storeCode(tx: PoolClient, secret: string, phone: string, code: string, now: Date): Promise<string> {
  await tx.query(
    'UPDATE otp_codes SET expires_at = $2 WHERE phone = $1 AND consumed_at IS NULL AND expires_at > $2',
    [phone, now],
  );
  const res = await tx.query<{ id: string }>(
    'INSERT INTO otp_codes (phone, code_hash, expires_at, created_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [phone, hashCode(secret, phone, code), new Date(now.getTime() + OTP_TTL_MS), now],
  );
  return res.rows[0]!.id;
}

export type RequestCodeResult = 'sent' | 'test_number' | 'rate_limited' | 'sms_failed';

/**
 * Creates a code for `phone` (already normalized) and texts it. Test numbers
 * get their fixed code, no SMS and no rate limit, so App Store review never
 * gets locked out.
 */
export async function requestCode(
  deps: Pick<AppDeps, 'config' | 'db' | 'clock' | 'sms' | 'log'>,
  ipLimiter: SlidingWindowLimiter,
  input: { phone: string; ip: string },
): Promise<RequestCodeResult> {
  const { phone, ip } = input;
  const secret = deps.config.otpSecret;
  const now = deps.clock.now();

  const testCode = testCodeFor(deps.config, phone);
  if (testCode) {
    await withTransaction(deps.db, (tx) => storeCode(tx, secret, phone, testCode, now));
    return 'test_number';
  }

  if (!ipLimiter.hit(ip, now)) return 'rate_limited';

  const code = generateCode();
  const codeId = await withTransaction(deps.db, async (tx) => {
    // Serializes requests for the same phone, so parallel calls can't pass the limit together.
    await tx.query('SELECT pg_advisory_xact_lock($1, hashtext($2))', [PHONE_LOCK_NS, phone]);
    const recent = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM otp_codes WHERE phone = $1 AND created_at > $2',
      [phone, new Date(now.getTime() - OTP_PER_PHONE_WINDOW_MS)],
    );
    if (recent.rows[0]!.n >= OTP_PER_PHONE_LIMIT) return null;
    return storeCode(tx, secret, phone, code, now);
  });
  if (!codeId) return 'rate_limited';

  try {
    await deps.sms.send(phone, smsText(code));
  } catch (err) {
    deps.log.error('otp: sms failed', { error: err instanceof Error ? err.message : String(err) });
    // An SMS that never left shouldn't count against the owner's limit.
    await deps.db.query('DELETE FROM otp_codes WHERE id = $1', [codeId]);
    return 'sms_failed';
  }
  return 'sent';
}

export type CodeCheck = 'ok' | 'invalid_code' | 'too_many_attempts';

/**
 * Checks `code` against the phone's latest live code and consumes it on
 * success; a wrong code counts one attempt. Call inside a transaction: the
 * code row stays locked until commit, so parallel guesses are serialized and
 * a code can only be used once.
 */
export async function consumeCode(
  tx: PoolClient,
  secret: string,
  input: { phone: string; code: string; now: Date },
): Promise<CodeCheck> {
  const { phone, code, now } = input;
  const res = await tx.query<{ id: string; code_hash: string; attempts: number }>(
    `SELECT id, code_hash, attempts FROM otp_codes
      WHERE phone = $1 AND consumed_at IS NULL AND expires_at > $2
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [phone, now],
  );
  const row = res.rows[0];
  if (!row) return 'invalid_code';
  if (row.attempts >= OTP_MAX_ATTEMPTS) return 'too_many_attempts';
  if (!codeMatches(secret, phone, code, row.code_hash)) {
    await tx.query('UPDATE otp_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return 'invalid_code';
  }
  await tx.query('UPDATE otp_codes SET consumed_at = $2 WHERE id = $1', [row.id, now]);
  return 'ok';
}
