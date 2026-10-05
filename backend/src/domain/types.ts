/**
 * Shared domain types. They mirror prototypes/v2/src/state/types.ts, with two
 * differences: prices are integers in FCFA (not free text) and the tone is a
 * single value.
 */

export type CategoryId = 'restaurant' | 'boutique';
export type Tone = 'formel' | 'amical' | 'ivoirien';

/** What the assistant should do when a learned question comes back. */
export type AssistantAction = 'catalog' | 'price' | 'delivery' | 'payment' | 'order' | 'handoff' | 'custom';
export const ASSISTANT_ACTIONS: readonly AssistantAction[] = [
  'catalog',
  'price',
  'delivery',
  'payment',
  'order',
  'handoff',
  'custom',
];

export type CatalogItem = {
  id: string;
  name: string;
  /** null = price on request. */
  priceFcfa: number | null;
  available: boolean;
  position: number;
};

export type LearnedAnswer = {
  id: string;
  question: string;
  action: AssistantAction;
  /** Product to quote for the 'price' action. */
  productId: string | null;
  /** Owner's own words for the 'custom' action. */
  answer: string;
  source: 'manual' | 'correction';
};

export type ShopProfile = {
  shopId: string;
  ownerName: string;
  ownerPhone: string;
  category: CategoryId | null;
  name: string;
  location: string;
  hours: string;
  deliveryFee: string;
  tiktok: string;
  instagram: string;
  facebook: string;
  salesChannels: string[];
  serviceModes: string[];
  deliveryZones: string[];
  payments: string[];
  tone: Tone;
  takeoverMinutes: number;
  /** Available and unavailable items, ordered by position. Deleted items are excluded. */
  catalog: CatalogItem[];
  /** Deleted answers are excluded. */
  answers: LearnedAnswer[];
};

export type MessageRole = 'customer' | 'assistant' | 'owner';
export type AlertKind = 'order' | 'question';
