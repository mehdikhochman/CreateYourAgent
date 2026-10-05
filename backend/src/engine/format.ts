/** Text formatting shared by the reply builders. Ported from prototypes/v2/src/lib/mock-assistant.ts. */
import type { CatalogItem } from '../domain/types';

const NBSP = ' ';

/** 12000 → "12 000 F" with non-breaking spaces, so a price never wraps. */
export function fcfa(n: number): string {
  const digits = Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? '-' : ''}${digits}${NBSP}F`;
}

/** "**12 000 F**", or « prix sur demande » when the owner set no price. */
export function priceText(item: Pick<CatalogItem, 'priceFcfa'>): string {
  return item.priceFcfa === null ? 'prix sur demande' : `**${fcfa(item.priceFcfa)}**`;
}

/** "• Robe pagne wax : **12 000 F**", one line per available item, at most `max` lines. */
export function listItems(items: CatalogItem[], max = 8): string {
  return items
    .filter((i) => i.available)
    .slice(0, max)
    .map((i) => `• ${i.name} : ${priceText(i)}`)
    .join('\n');
}

/** Newlines and runs of spaces become one space. */
export function singleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Single line, at most `max` characters (an ellipsis marks a cut). */
export function excerpt(text: string, max: number): string {
  const line = singleLine(text);
  return line.length <= max ? line : `${line.slice(0, max - 1).trimEnd()}…`;
}

/** The first 60 characters of the customer's words, quoted, for an alert the owner reads in « À traiter ». */
export function quoted(message: string, max = 60): string {
  return `« ${singleLine(message).slice(0, max).trim()} »`;
}
