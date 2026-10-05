/**
 * Normalizes a phone number to E.164 (`+2250748123390`). Accepts spaces, dots
 * and dashes, and a leading 00. Returns null if it doesn't look like an
 * international number.
 */
export function normalizePhone(input: string): string | null {
  let p = input.trim().replace(/[\s.\-()]/g, '');
  if (p.startsWith('00')) p = `+${p.slice(2)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(p)) return null;
  return p;
}

/** WhatsApp ids are E.164 digits without '+'. */
export function phoneToWaId(phone: string): string {
  return phone.replace(/^\+/, '');
}

export function waIdToPhone(waId: string): string {
  return `+${waId.replace(/^\+/, '')}`;
}
