import type { BusinessProfile, CatalogItem, CategoryId, ChoiceField, TextField } from '@/state/types';

export type Option = { value: string; label: string; emoji?: string };

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
  | (BaseStep & { kind: 'socials' })
  | (BaseStep & { kind: 'catalog' });

export type Category = {
  id: CategoryId;
  emoji: string;
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

export const PAYMENT_OPTIONS: Option[] = [
  { value: 'Wave', label: 'Wave', emoji: '🌊' },
  { value: 'Orange Money', label: 'Orange Money', emoji: '🟠' },
  { value: 'MTN MoMo', label: 'MTN MoMo', emoji: '🟡' },
  { value: 'Moov Money', label: 'Moov Money', emoji: '🔵' },
  { value: 'Espèces', label: 'Espèces (à la livraison)', emoji: '💵' },
  { value: 'Carte bancaire', label: 'Carte bancaire', emoji: '💳' },
];

export const TONE_OPTIONS: Option[] = [
  { value: 'formel', label: 'Professionnel', emoji: '👔' },
  { value: 'amical', label: 'Amical', emoji: '😊' },
  { value: 'ivoirien', label: 'Ivoirien décontracté', emoji: '🇨🇮' },
];

const ONLINE_CHANNELS = ['tiktok', 'instagram', 'facebook', 'whatsapp'];

export const hasShop = (p: BusinessProfile) => p.salesChannels.includes('shop');
export const sellsOnline = (p: BusinessProfile) =>
  p.salesChannels.some((c) => ONLINE_CHANNELS.includes(c));
const hasSocialAccount = (p: BusinessProfile) =>
  p.salesChannels.some((c) => ['tiktok', 'instagram', 'facebook'].includes(c));
const delivers = (p: BusinessProfile) => p.serviceModes.includes('livraison');

const deliveryZonesStep = (showIf?: Step['showIf']): Step => ({
  id: 'deliveryZones',
  kind: 'choice',
  field: 'deliveryZones',
  multiple: true,
  title: 'Où livrez-vous ?',
  subtitle: 'Touchez toutes les zones que vous couvrez.',
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
  title: 'Comment vos clients peuvent-ils payer ?',
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
    emoji: '🍽️',
    label: 'Restaurant / Maquis',
    description: 'Menu, horaires, livraison, réservations',
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
        title: 'Où êtes-vous situé ?',
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
        title: 'Quels services proposez-vous ?',
        options: [
          { value: 'sur_place', label: 'Sur place', emoji: '🪑' },
          { value: 'emporter', label: 'À emporter', emoji: '🥡' },
          { value: 'livraison', label: 'Livraison', emoji: '🛵' },
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
    emoji: '🛍️',
    label: 'Boutique / Vente en ligne',
    description: 'Boutique physique, TikTok, Instagram, Facebook…',
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
        subtitle: 'Touchez tout ce qui s’applique.',
        options: [
          { value: 'shop', label: 'Boutique physique', emoji: '🏬' },
          { value: 'tiktok', label: 'TikTok', emoji: '🎵' },
          { value: 'instagram', label: 'Instagram', emoji: '📸' },
          { value: 'facebook', label: 'Facebook', emoji: '👍' },
          { value: 'whatsapp', label: 'Statut / catalogue WhatsApp', emoji: '💬' },
        ],
      },
      {
        id: 'socials',
        kind: 'socials',
        title: 'Vos comptes en ligne',
        subtitle: 'Votre assistant pourra envoyer vos clients vers vos vidéos et vos posts.',
        optional: true,
        showIf: hasSocialAccount,
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
        subtitle: 'Ouverture de la boutique, ou heures où vous répondez et livrez.',
        placeholder: 'Ex : Lun – Sam, 9h – 19h',
      },
      {
        id: 'catalog',
        kind: 'catalog',
        title: 'Vos produits et vos prix',
        subtitle: 'Photo de votre liste de prix, ou ajoutez-les un par un.',
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
  socials: 'Comptes en ligne',
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
    case 'socials':
      return true;
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
    case 'socials':
      return [p.tiktok, p.instagram, p.facebook].filter(Boolean).join(' · ');
  }
}
