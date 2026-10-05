/** Finds the catalogue items a message talks about. Ported from the prototype's findProducts. */
import type { CatalogItem } from '../domain/types';
import { keywords } from '../domain/text';

/**
 * Same word, or one is a prefix of the other ("sac" / "sacs", "braise" / "braises").
 * A short word only matches a slightly longer one, so "main" (Sac à main) does
 * not match "maintenant".
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return long.startsWith(short) && (long.length - short.length <= 2 || short.length >= 5);
}

/**
 * Available items whose name shares a meaningful word with the message.
 * An item is dropped when another one matches strictly more of the message's
 * words: « poulet braisé » finds « Poulet braisé + alloco », not « Attiéké
 * poisson braisé ».
 */
export function findProducts(catalog: CatalogItem[], message: string): CatalogItem[] {
  const words = keywords(message);
  if (!words.length) return [];
  const matches = catalog
    .filter((item) => item.available)
    .map((item) => {
      const itemWords = keywords(item.name);
      return { item, hits: new Set(words.filter((w) => itemWords.some((iw) => wordsMatch(w, iw)))) };
    })
    .filter((m) => m.hits.size > 0);

  const dominated = (a: Set<string>, b: Set<string>) => b.size > a.size && [...a].every((w) => b.has(w));
  return matches.filter((m) => !matches.some((other) => dominated(m.hits, other.hits))).map((m) => m.item);
}

/** Catalogue items by id, in the catalogue's order, keeping only available ones. */
export function itemsById(catalog: CatalogItem[], ids: readonly string[]): CatalogItem[] {
  return catalog.filter((item) => item.available && ids.includes(item.id));
}
