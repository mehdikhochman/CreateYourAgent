/**
 * Realistic Meta webhook payloads (./fixtures/*.json) for tests and local curl
 * testing. They all target phone_number_id 1234567890 (seedChannel's default)
 * and the customer wa_id 2250748123390.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

export type MetaFixtureName =
  | 'text'
  | 'burst'
  | 'audio'
  | 'image'
  | 'interactive'
  | 'reaction'
  | 'status-sent'
  | 'status-delivered'
  | 'status-read'
  | 'status-failed'
  | 'echo'
  | 'unrelated';

/** wamid of the outbound message the status fixtures refer to. */
export const FIXTURE_OUTBOUND_WAMID = 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABEYEk9VVEJPVU5EMDAwMDAwMDAwMQA=';
export const FIXTURE_PHONE_NUMBER_ID = '1234567890';
export const FIXTURE_CUSTOMER_WA_ID = '2250748123390';

/** Raw text (what Meta signs) and parsed body of a fixture. */
export function metaFixture(name: MetaFixtureName): { raw: string; body: unknown } {
  const raw = readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8');
  return { raw, body: JSON.parse(raw) };
}

/** The X-Hub-Signature-256 header Meta would send for this body. */
export function signMetaBody(raw: string, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex')}`;
}
