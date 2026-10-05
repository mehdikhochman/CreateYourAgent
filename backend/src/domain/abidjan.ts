import type { ShopProfile } from './types';

/** Delivery zones offered in onboarding (prototypes/v2/src/data/categories.ts). */
export const ABIDJAN_ZONES = [
  'Tout Abidjan',
  'Cocody',
  'Riviera',
  'Angré',
  'Plateau',
  'Marcory',
  'Zone 4',
  'Treichville',
  'Koumassi',
  'Port-Bouët',
  'Yopougon',
  'Adjamé',
  'Abobo',
  'Bingerville',
  'Anyama',
  'Intérieur du pays',
] as const;

export const PAYMENT_OPTIONS = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Espèces', 'Carte bancaire'] as const;

/** Values of `salesChannels`. */
export const SALES_CHANNELS = ['shop', 'tiktok', 'instagram', 'facebook', 'whatsapp'] as const;

const ONLINE_CHANNELS = ['tiktok', 'instagram', 'facebook', 'whatsapp'];

export const hasShop = (p: Pick<ShopProfile, 'salesChannels'>) => p.salesChannels.includes('shop');
export const sellsOnline = (p: Pick<ShopProfile, 'salesChannels'>) =>
  p.salesChannels.some((c) => ONLINE_CHANNELS.includes(c));
