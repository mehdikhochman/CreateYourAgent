/** Delivery zones: finding the place a customer names, and whether the shop covers it. */
import { ABIDJAN_ZONES } from '../domain/abidjan';
import type { ShopProfile } from '../domain/types';
import { has, normalize } from '../domain/text';

export type Zone = (typeof ABIDJAN_ZONES)[number];

export const ALL_ABIDJAN: Zone = 'Tout Abidjan';
export const INLAND: Zone = 'Intérieur du pays';

/** How customers write the zones, beyond their full names (already normalized). */
const ALIASES: { zone: Zone; words: string[] }[] = [
  { zone: 'Yopougon', words: ['yop', 'yopcity', 'yop city'] },
  { zone: 'Cocody', words: ['2 plateaux', 'deux plateaux', 'ii plateaux'] },
  { zone: 'Treichville', words: ['treich'] },
  { zone: 'Koumassi', words: ['koum'] },
  { zone: 'Zone 4', words: ['zone4'] },
  { zone: 'Port-Bouët', words: ['portbouet', 'vridi', 'gonzagueville'] },
  { zone: 'Bingerville', words: ['binger'] },
  {
    zone: INLAND,
    words: ['interieur', 'bouake', 'yamoussoukro', 'yakro', 'san pedro', 'daloa', 'korhogo', 'gagnoa', 'abengourou', 'bassam', 'grand bassam'],
  },
];

/** "Yopougon", "yop", "YOPOUGON" → 'Yopougon'. Anything else → null. */
export function canonicalZone(raw: string | null | undefined): Zone | null {
  if (!raw) return null;
  const n = normalize(raw);
  return ABIDJAN_ZONES.find((z) => normalize(z) === n) ?? ALIASES.find((a) => a.words.includes(n))?.zone ?? null;
}

/** The first specific zone named in a message (never 'Tout Abidjan'). */
export function findZone(message: string): Zone | null {
  const msg = normalize(message);
  const named = ABIDJAN_ZONES.find((z) => z !== ALL_ABIDJAN && has(msg, [normalize(z)]));
  return named ?? ALIASES.find((a) => has(msg, a.words))?.zone ?? null;
}

/** 'Tout Abidjan' covers every zone except the rest of the country. */
export function zoneCovered(p: Pick<ShopProfile, 'deliveryZones'>, zone: Zone): boolean {
  return p.deliveryZones.includes(zone) || (p.deliveryZones.includes(ALL_ABIDJAN) && zone !== INLAND);
}

/** « à Cocody », « au Plateau », « à l’intérieur du pays ». */
export function toZone(zone: Zone): string {
  if (zone === 'Plateau') return 'au Plateau';
  if (zone === INLAND) return 'à l’intérieur du pays';
  return `à ${zone}`;
}
