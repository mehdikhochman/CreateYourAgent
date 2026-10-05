/** Shops the eval runs against: the prototype's demo boutique and a maquis. */
import type { ShopProfile } from '../../domain/types';

/** Awa Fashion, from prototypes/v2/src/data/demo-profile.ts: sells online only, on TikTok and Instagram. */
export const AWA_FASHION: ShopProfile = {
  shopId: 'eval-awa',
  ownerName: 'Awa',
  ownerPhone: '+2250748123390',
  category: 'boutique',
  name: 'Awa Fashion',
  location: '',
  hours: 'Lun–Sam · 9h–20h',
  deliveryFee: '1 500 F à Cocody, 2 000 F ailleurs',
  tiktok: '@awafashion225',
  instagram: '@awa.fashion',
  facebook: '',
  salesChannels: ['tiktok', 'instagram'],
  serviceModes: ['livraison'],
  deliveryZones: ['Cocody', 'Yopougon'],
  payments: ['Wave', 'Orange Money'],
  tone: 'ivoirien',
  takeoverMinutes: 120,
  catalog: [
    { id: 'awa-robe', name: 'Robe pagne wax (taille S à XL)', priceFcfa: 12000, available: true, position: 0 },
    { id: 'awa-sac', name: 'Sac à main simili cuir', priceFcfa: 8500, available: true, position: 1 },
    { id: 'awa-bazin', name: 'Ensemble bazin brodé', priceFcfa: 25000, available: true, position: 2 },
    { id: 'awa-perruque', name: 'Perruque lisse 20 pouces', priceFcfa: 30000, available: false, position: 3 },
    { id: 'awa-sandales', name: 'Sandales dames', priceFcfa: null, available: true, position: 4 },
  ],
  answers: [
    {
      id: 'awa-xxl',
      question: 'Vous avez des tailles XXL ?',
      action: 'custom',
      productId: null,
      answer: 'Oui, certains modèles existent en XXL. Envoyez-nous la photo du modèle et on vérifie pour vous.',
      source: 'manual',
    },
  ],
};

/** A maquis in Yopougon with a counter, delivering to Yopougon and Abobo. */
export const MAQUIS_TANTIE: ShopProfile = {
  shopId: 'eval-tantie',
  ownerName: 'Tantie Adjoua',
  ownerPhone: '+2250505050505',
  category: 'restaurant',
  name: 'Maquis Chez Tantie',
  location: 'Yopougon Selmer, derrière la pharmacie',
  hours: 'Tous les jours, 11h – 23h',
  deliveryFee: '500 F à Yopougon, 1 000 F à Abobo',
  tiktok: '',
  instagram: '',
  facebook: 'Maquis Chez Tantie',
  salesChannels: ['shop', 'facebook'],
  serviceModes: ['sur_place', 'emporter', 'livraison'],
  deliveryZones: ['Yopougon', 'Abobo'],
  payments: ['Wave', 'Espèces'],
  tone: 'amical',
  takeoverMinutes: 120,
  catalog: [
    { id: 'tantie-garba', name: 'Garba', priceFcfa: 1000, available: true, position: 0 },
    { id: 'tantie-alloco', name: 'Alloco', priceFcfa: 500, available: true, position: 1 },
    { id: 'tantie-poulet', name: 'Poulet braisé + alloco', priceFcfa: 4000, available: true, position: 2 },
    { id: 'tantie-attieke', name: 'Attiéké poisson braisé', priceFcfa: 3500, available: true, position: 3 },
    { id: 'tantie-kedjenou', name: 'Kedjenou de poulet', priceFcfa: 5000, available: false, position: 4 },
    { id: 'tantie-bissap', name: 'Jus de bissap', priceFcfa: 500, available: true, position: 5 },
  ],
  answers: [
    {
      id: 'tantie-bapteme',
      question: 'Vous faites les commandes pour les baptêmes ?',
      action: 'custom',
      productId: null,
      answer: 'Oui, on prépare pour les baptêmes et les fêtes. Appelez Tantie la veille pour organiser.',
      source: 'manual',
    },
  ],
};
