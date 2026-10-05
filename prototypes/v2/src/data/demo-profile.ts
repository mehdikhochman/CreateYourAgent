import type { BusinessProfile } from '@/state/types';

/**
 * Ready-made shop used by « J’ai déjà un compte » so testers can jump
 * straight to the dashboard. The real app loads the owner's account instead.
 */
export const DEMO_PROFILE: BusinessProfile = {
  ownerPhone: '+225 07 48 12 33 90',
  ownerName: 'Awa',
  logoUri: null,
  category: 'boutique',
  name: 'Awa Fashion',
  location: '',
  hours: 'Lun–Sam · 9h–20h',
  deliveryFee: '1 500 F à Cocody, 2 000 F ailleurs',
  tiktok: '@awafashion225',
  instagram: '@awa.fashion',
  facebook: '',
  salesChannels: ['tiktok', 'instagram'],
  serviceModes: [],
  deliveryZones: ['Cocody', 'Yopougon'],
  payments: ['Wave', 'Orange Money'],
  tone: ['ivoirien'],
  catalog: [
    { id: 'demo_1', name: 'Robe pagne wax (taille S à XL)', price: '12 000' },
    { id: 'demo_2', name: 'Sac à main simili cuir', price: '8 500' },
  ],
  faqs: [],
  whatsappConnected: true,
};
