import { createHmac, timingSafeEqual } from 'node:crypto';

const HEADER_RE = /^sha256=([0-9a-f]{64})$/i;

/**
 * Checks Meta's `X-Hub-Signature-256: sha256=<hex>` header, the HMAC-SHA256 of
 * the raw request body keyed with the app secret. Returns false on any
 * malformed or missing input instead of throwing.
 */
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (typeof rawBody !== 'string' || !header || !appSecret) return false;
  const match = HEADER_RE.exec(header.trim());
  if (!match) return false;
  const given = Buffer.from(match[1]!, 'hex');
  const expected = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
