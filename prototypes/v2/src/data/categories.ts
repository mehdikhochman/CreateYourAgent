import {
  Armchair,
  Bike,
  Briefcase,
  House,
  Package,
  Pill,
  Scissors,
  ShoppingBag,
  Smile,
  Sun,
  UtensilsCrossed,
  type LucideIcon,
} from '@/components/icons';

import type { BusinessProfile, CatalogItem, CategoryId, ChoiceField, TextField } from '@/state/types';

export type Option = { value: string; label: string; description?: string; icon?: LucideIcon };

type BaseStep = {
  id: string;
  title: string;
  subtitle?: string;
  optional?: boolean;
  /** Hide the step when it does not apply (e.g. no shop address for online-only sellers). */
  showIf?: (p: BusinessProfile) => boolean;
};

export type Step =
  | (BaseStep & { kind: 'text'; field: TextField; placeholder: string; multiline?: boolean })
  | (BaseStep & { kind: 'choice'; field: ChoiceField; options: Option[]; multiple: boolean })
  | (BaseStep & { kind: 'catalog' });

export type Category = {
  id: CategoryId;
  icon: LucideIcon;
  label: string;
  description: string;
  catalogLabel: string;
  steps: Step[];
  /** Items returned by the simulated "photo of your menu / price list" extraction. */
  demoExtraction: Omit<CatalogItem, 'id'>[];
};

export const ABIDJAN_ZONES: Option[] = [
  { value: 'Tout Abidjan', label: 'Tout Abidjan' },
  { value: 'Cocody', label: 'Cocody' },
  { value: 'Riviera', label: 'Riviera' },
  { value: 'Angré', label: 'Angré' },
  { value: 'Plateau', label: 'Plateau' },
  { value: 'Marcory', label: 'Marcory' },
  { value: 'Zone 4', label: 'Zone 4' },
  { value: 'Treichville', label: 'Treichville' },
  { value: 'Koumassi', label: 'Koumassi' },
  { value: 'Port-Bouët', label: 'Port-Bouët' },
  { value: 'Yopougon', label: 'Yopougon' },
  { value: 'Adjamé', label: 'Adjamé' },
  { value: 'Abobo', label: 'Abobo' },
  { value: 'Bingerville', label: 'Bingerville' },
  { value: 'Anyama', label: 'Anyama' },
  { value: 'Intérieur du pays', label: 'Intérieur du pays' },
];

// Logos are drawn by PaymentLogo (components/brand/logos.tsx) from these values.
export const PAYMENT_OPTIONS: Option[] = [
  { value: 'Wave', label: 'Wave' },
  { value: 'Orange Money', label: 'Orange Money' },
  { value: 'MTN MoMo', label: 'MTN Mobile Money' },
  { value: 'Moov Money', label: 'Moov Money' },
  { value: 'Espèces', label: 'Espèces (cash)' },
  { value: 'Carte bancaire', label: 'Carte bancaire' },
];

export const TONE_OPTIONS: Option[] = [
  { value: 'formel', label: 'Professionnel', icon: Briefcase },
  { value: 'amical', label: 'Amical', icon: Smile },
  { value: 'ivoirien', label: 'Ivoirien décontracté', icon: Sun },
];

// Logos are drawn by ChannelLogo from these values.
export const SALES_CHANNELS: Option[] = [
  { value: 'shop', label: 'Boutique physique' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'whatsapp', label: 'Statut et catalogue WhatsApp', description: 'Vous postez vos produits en statut' },
];

/** Account handle asked under « Où vendez-vous ? » for each social channel picked. */
export const SOCIAL_ACCOUNTS = [
  { channel: 'tiktok', field: 'tiktok', label: 'Votre compte TikTok', placeholder: '@votrecompte' },
  { channel: 'instagram', field: 'instagram', label: 'Votre compte Instagram', placeholder: '@votrecompte' },
  { channel: 'facebook', field: 'facebook', label: 'Votre page Facebook', placeholder: 'Nom de votre page' },
] as const;

export const COMING_SOON: { label: string; icon: LucideIcon }[] = [
  { label: 'Salon', icon: Scissors },
  { label: 'Pharmacie', icon: Pill },
  { label: 'Immobilier', icon: House },
];

const ONLINE_CHANNELS = ['tiktok', 'instagram', 'facebook', 'whatsapp'];

export const hasShop = (p: BusinessProfile) => p.salesChannels.includes('shop');
export const sellsOnline = (p: BusinessProfile) =>
  p.salesChannels.some((c) => ONLINE_CHANNELS.includes(c));
const delivers = (p: BusinessProfile) => p.serviceModes.includes('livraison');

const deliveryZonesStep = (showIf?: Step['showIf']): Step => ({
  id: 'deliveryZones',
  kind: 'choice',
  field: 'deliveryZones',
  multiple: true,
  title: 'Où livrez-vous ?',
  subtitle: 'Touchez tous les endroits où vous livrez.',
  options: ABIDJAN_ZONES,
  showIf,
});

const deliveryFeeStep = (showIf?: Step['showIf']): Step => ({
  id: 'deliveryFee',
  kind: 'text',
  field: 'deliveryFee',
  title: 'Combien coûte la livraison ?',
  placeholder: 'Ex : 1 000 F à Cocody, 1 500 F ailleurs',
  showIf,
});

const paymentsStep: Step = {
  id: 'payments',
  kind: 'choice',
  field: 'payments',
  multiple: true,
  title: 'Comment vos clients paient-ils ?',
  subtitle: 'Touchez tous les moyens acceptés. Tiko les donnera à vos clients.',
  options: PAYMENT_OPTIONS,
};

const toneStep: Step = {
  id: 'tone',
  kind: 'choice',
  field: 'tone',
  multiple: false,
  title: 'Comment votre assistant doit-il parler ?',
  subtitle: 'Vous pourrez changer plus tard.',
  options: TONE_OPTIONS,
};

export const CATEGORIES: Category[] = [
  {
    id: 'restaurant',
    icon: UtensilsCrossed,
    label: 'Restaurant / Maquis',
    description: 'Menu, horaires, livraison',
    catalogLabel: 'Votre menu',
    steps: [
      {
        id: 'name',
        kind: 'text',
        field: 'name',
        title: 'Comment s’appelle votre restaurant ?',
        placeholder: 'Ex : Maquis Chez Tantie',
      },
      {
        id: 'location',
        kind: 'text',
        field: 'location',
        title: 'Où se trouve votre restaurant ?',
        subtitle: 'Donnez un repère que vos clients connaissent.',
        placeholder: 'Ex : Yopougon Selmer, derrière la pharmacie',
      },
      {
        id: 'hours',
        kind: 'text',
        field: 'hours',
        title: 'Quels sont vos horaires ?',
        placeholder: 'Ex : Tous les jours, 11h – 23h',
      },
      {
        id: 'serviceModes',
        kind: 'choice',
        field: 'serviceModes',
        multiple: true,
        title: 'Comment servez-vous vos clients ?',
        subtitle: 'Touchez tout ce que vous faites.',
        options: [
          { value: 'sur_place', label: 'Sur place', icon: Armchair },
          { value: 'emporter', label: 'À emporter', icon: Package },
          { value: 'livraison', label: 'Livraison', icon: Bike },
        ],
      },
      {
        id: 'catalog',
        kind: 'catalog',
        title: 'Votre menu et vos prix',
        subtitle: 'Prenez votre menu en photo, on s’occupe du reste.',
      },
      deliveryZonesStep(delivers),
      deliveryFeeStep(delivers),
      paymentsStep,
      toneStep,
    ],
    demoExtraction: [
      { name: 'Garba', price: '1 000' },
      { name: 'Attiéké poisson braisé', price: '3 500' },
      { name: 'Poulet braisé + alloco', price: '4 000' },
      { name: 'Kedjenou de poulet', price: '5 000' },
      { name: 'Foutou sauce graine', price: '3 000' },
      { name: 'Jus de bissap', price: '500' },
    ],
  },
  {
    id: 'boutique',
    icon: ShoppingBag,
    label: 'Boutique / Vente en ligne',
    description: 'Boutique physique, TikTok, Instagram, Facebook',
    catalogLabel: 'Vos produits',
    steps: [
      {
        id: 'name',
        kind: 'text',
        field: 'name',
        title: 'Comment s’appelle votre boutique ?',
        subtitle: 'Ou le nom de votre page si vous vendez en ligne.',
        placeholder: 'Ex : Awa Fashion',
      },
      {
        id: 'salesChannels',
        kind: 'choice',
        field: 'salesChannels',
        multiple: true,
        title: 'Où vendez-vous ?',
        subtitle: 'Touchez tout ce que vous utilisez. Tiko enverra vos clients vers vos vidéos et vos posts.',
        options: SALES_CHANNELS,
      },
      {
        id: 'location',
        kind: 'text',
        field: 'location',
        title: 'Où se trouve votre boutique ?',
        subtitle: 'Donnez un repère que vos clients connaissent.',
        placeholder: 'Ex : Cocody Angré, 8e tranche, près du carrefour',
        showIf: hasShop,
      },
      {
        id: 'hours',
        kind: 'text',
        field: 'hours',
        title: 'Quels sont vos horaires ?',
        subtitle: 'Les heures d’ouverture. Si vous vendez en ligne : les heures où vous livrez.',
        placeholder: 'Ex : Lun – Sam, 9h – 19h',
      },
      {
        id: 'catalog',
        kind: 'catalog',
        title: 'Vos produits et vos prix',
        subtitle: 'Prenez votre liste de prix en photo, ou ajoutez vos produits un par un.',
      },
      deliveryZonesStep((p) => sellsOnline(p) || !hasShop(p)),
      deliveryFeeStep((p) => sellsOnline(p) || !hasShop(p)),
      paymentsStep,
      toneStep,
    ],
    demoExtraction: [
      { name: 'Robe pagne wax (taille S à XL)', price: '12 000' },
      { name: 'Ensemble bazin brodé', price: '25 000' },
      { name: 'Sac à main simili cuir', price: '8 500' },
      { name: 'Perruque lisse 20 pouces', price: '30 000' },
      { name: 'Sandales dames', price: '6 000' },
    ],
  },
];

/** Short names used in the « Mon assistant » settings list. */
export const STEP_LABELS: Record<string, string> = {
  name: 'Nom',
  salesChannels: 'Où vous vendez',
  location: 'Adresse',
  hours: 'Horaires',
  serviceModes: 'Services',
  catalog: 'Produits et prix',
  deliveryZones: 'Zones de livraison',
  deliveryFee: 'Frais de livraison',
  payments: 'Paiement',
  tone: 'Ton de l’assistant',
};

export function getCategory(id: CategoryId | null): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

export function visibleSteps(category: Category, profile: BusinessProfile): Step[] {
  return category.steps.filter((s) => !s.showIf || s.showIf(profile));
}

export function optionLabel(options: Option[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function isStepAnswered(step: Step, p: BusinessProfile): boolean {
  switch (step.kind) {
    case 'text':
      return p[step.field].trim().length > 0;
    case 'choice':
      return p[step.field].length > 0;
    case 'catalog':
      return p.catalog.length > 0;
  }
}

/** One-line summary of an answer, for the settings list. Empty = not filled. */
export function stepSummary(step: Step, p: BusinessProfile): string {
  switch (step.kind) {
    case 'text':
      return p[step.field].trim();
    case 'choice':
      return p[step.field].map((v) => optionLabel(step.options, v)).join(', ');
    case 'catalog':
      return p.catalog.length ? `${p.catalog.length} produit${p.catalog.length > 1 ? 's' : ''}` : '';
  }
}
