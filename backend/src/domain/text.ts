/**
 * Text helpers shared by the assistant and the learned-answers API.
 * Ported from prototypes/v2/src/lib/mock-assistant.ts.
 */

// "oh", "deh", "han"… are fillers in Abidjan French and carry no meaning.
export const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'a', 'au', 'aux', 'en',
  'est', 'c', 'ce', 'ca', 'vous', 'je', 'tu', 'il', 'on', 'nous', 'mon', 'ma', 'mes',
  'votre', 'vos', 'pour', 'avec', 'sur', 'pas', 'que', 'qui', 'quoi', 'svp', 's',
  'y', 'avez', 'combien', 'prix', 'bonjour', 'bonsoir', 'merci', 'est-ce', 'l', 'd',
  'oh', 'ooh', 'deh', 'han', 'hein', 'wesh', 'eh', 'bon', 'veux', 'voudrais',
  'payer', 'acheter', 'prendre', 'prends', 'commander', 'dispo', 'disponible',
]);

/** Lowercase, no accents, no punctuation, single spaces. « C’est combien ? » → "c est combien". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Meaningful words (3+ letters, not a stop word). */
export function keywords(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/**
 * Matches whole words or phrases in an already-normalized text, so "om" does
 * not match inside "combien". A pattern ending with * matches a word prefix.
 */
export function has(normalizedText: string, patterns: string[]): boolean {
  const padded = ` ${normalizedText} `;
  return patterns.some((p) => (p.endsWith('*') ? padded.includes(` ${p.slice(0, -1)}`) : padded.includes(` ${p} `)));
}
