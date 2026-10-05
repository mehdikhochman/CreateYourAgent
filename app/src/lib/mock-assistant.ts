/**
 * Prototype-only assistant: answers from the business profile with simple
 * keyword rules so the app can be tested without a backend.
 *
 * In the real product this module is replaced by a call to our backend,
 * which builds a prompt from the same profile and asks an LLM. Keep the
 * `AssistantReply` shape so screens don't need to change.
 */
import { ABIDJAN_ZONES, getCategory, hasShop, sellsOnline } from '@/data/categories';
import type { AssistantAction, BusinessProfile, CatalogItem, Faq } from '@/state/types';

export type AssistantReply = {
  text: string;
  /** false → the owner is notified that a human should look at it. */
  confident: boolean;
};

// "oh", "deh", "han"… are fillers in Abidjan French and carry no meaning.
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'a', 'au', 'aux', 'en',
  'est', 'c', 'ce', 'ca', 'vous', 'je', 'tu', 'il', 'on', 'nous', 'mon', 'ma', 'mes',
  'votre', 'vos', 'pour', 'avec', 'sur', 'pas', 'que', 'qui', 'quoi', 'svp', 's',
  'y', 'avez', 'combien', 'prix', 'bonjour', 'bonsoir', 'merci', 'est-ce', 'l', 'd',
  'oh', 'ooh', 'deh', 'han', 'hein', 'wesh', 'eh', 'bon', 'veux', 'voudrais',
  'payer', 'acheter', 'prendre', 'prends', 'commander', 'dispo', 'disponible',
]);

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function keywords(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

/** Matches whole words or phrases, so "om" does not match inside "combien". */
function has(text: string, patterns: string[]): boolean {
  const padded = ` ${text} `;
  return patterns.some((p) => (p.endsWith('*') ? padded.includes(` ${p.slice(0, -1)}`) : padded.includes(` ${p} `)));
}

export function findProducts(catalog: CatalogItem[], message: string): CatalogItem[] {
  const words = keywords(message);
  return catalog.filter((item) => {
    const itemWords = keywords(item.name);
    return words.some((w) => itemWords.some((iw) => iw.startsWith(w) || w.startsWith(iw)));
  });
}

function listItems(items: CatalogItem[], max = 8): string {
  return items
    .slice(0, max)
    .map((i) => `• ${i.name} : ${i.price} F`)
    .join('\n');
}

function tone(p: BusinessProfile) {
  return p.tone[0] ?? 'amical';
}

function greeting(p: BusinessProfile): string {
  if (tone(p) === 'formel') return `Bonjour et bienvenue chez ${p.name || 'nous'}.`;
  if (tone(p) === 'ivoirien') return `Bonne arrivée chez ${p.name || 'nous'} ! 🙌🏾`;
  return `Coucou ! Bienvenue chez ${p.name || 'nous'} 😊`;
}

function signOff(p: BusinessProfile): string {
  if (tone(p) === 'formel') return 'Puis-je vous aider pour autre chose ?';
  if (tone(p) === 'ivoirien') return 'On est ensemble ! Autre chose ?';
  return 'Je peux vous aider pour autre chose ? 😊';
}

// ---------------------------------------------------------------------------
// Actions: each one builds its reply from the profile, so a learned answer
// stays correct when prices, zones or payment methods change.

export const ACTIONS: { id: AssistantAction; emoji: string; label: string }[] = [
  { id: 'catalog', emoji: '📋', label: 'Montrer le catalogue' },
  { id: 'price', emoji: '🏷️', label: 'Donner le prix d’un produit' },
  { id: 'delivery', emoji: '🛵', label: 'Expliquer la livraison' },
  { id: 'payment', emoji: '💳', label: 'Expliquer le paiement' },
  { id: 'order', emoji: '🛍️', label: 'Prendre la commande et me prévenir' },
  { id: 'handoff', emoji: '🙋🏾', label: 'Me passer la main' },
  { id: 'custom', emoji: '✍️', label: 'Écrire ma propre réponse' },
];

export function actionLabel(action: AssistantAction): string {
  return ACTIONS.find((a) => a.id === action)?.label ?? action;
}

function catalogReply(p: BusinessProfile): AssistantReply {
  const word = getCategory(p.category)?.id === 'restaurant' ? 'notre menu' : 'nos produits';
  if (!p.catalog.length) return { text: 'Je vérifie avec le responsable et je reviens vers vous.', confident: false };
  return { text: `Voici ${word} :\n${listItems(p.catalog)}\n\n${signOff(p)}`, confident: true };
}

function priceReply(p: BusinessProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) return catalogReply(p);
  return { text: `${listItems(items)}\n\n${signOff(p)}`, confident: true };
}

function deliveryReply(p: BusinessProfile, message = ''): AssistantReply {
  if (!p.deliveryZones.length) return { text: 'Désolé, nous ne faisons pas de livraison pour le moment.', confident: true };
  const fee = p.deliveryFee ? ` Frais de livraison : ${p.deliveryFee}.` : '';
  // Answer about the place the customer named, never a blanket "oui".
  const msg = normalize(message);
  const asked = ABIDJAN_ZONES.find((z) => z.value !== 'Tout Abidjan' && has(msg, [normalize(z.value)]));
  if (asked) {
    const covered = p.deliveryZones.includes(asked.value) || (p.deliveryZones.includes('Tout Abidjan') && asked.value !== 'Intérieur du pays');
    if (!covered) {
      return {
        text: `Désolé, nous ne livrons pas encore à ${asked.label}. Nous livrons : ${p.deliveryZones.join(', ')}. Je demande au responsable s’il peut s’arranger.`,
        confident: false,
      };
    }
    return { text: `Oui, nous livrons à ${asked.label} !${fee}`, confident: true };
  }
  return { text: `Oui, nous livrons : ${p.deliveryZones.join(', ')}.${fee}`, confident: true };
}

function paymentReply(p: BusinessProfile): AssistantReply {
  if (!p.payments.length) return { text: 'Je vérifie avec le responsable.', confident: false };
  return { text: `Vous pouvez payer par : ${p.payments.join(', ')}.`, confident: true };
}

function orderReply(p: BusinessProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) {
    return {
      text: `Avec plaisir ! Qu’est-ce qui vous ferait plaisir ?\n${listItems(p.catalog, 5)}`,
      confident: false,
    };
  }
  return {
    text: `Très bon choix ! 👌🏾\n${listItems(items)}\n\nLe responsable vous confirme la commande, la livraison et le paiement dans quelques minutes.`,
    confident: false,
  };
}

function handoffReply(): AssistantReply {
  return { text: 'Je préviens tout de suite le responsable, il vous répond ici très vite. 🙏🏾', confident: false };
}

export function runAction(p: BusinessProfile, faq: Pick<Faq, 'action' | 'productId' | 'answer'>, message: string): AssistantReply {
  switch (faq.action) {
    case 'catalog':
      return catalogReply(p);
    case 'price': {
      const chosen = p.catalog.filter((i) => i.id === faq.productId);
      return priceReply(p, chosen.length ? chosen : findProducts(p.catalog, message));
    }
    case 'delivery':
      return deliveryReply(p, message);
    case 'payment':
      return paymentReply(p);
    case 'order':
      return orderReply(p, findProducts(p.catalog, message));
    case 'handoff':
      return handoffReply();
    case 'custom':
      return { text: faq.answer, confident: true };
  }
}

function findLearned(p: BusinessProfile, message: string): Faq | undefined {
  const msg = normalize(message);
  const msgWords = keywords(message);
  return p.faqs.find((f) => {
    if (normalize(f.question) === msg) return true;
    const fw = keywords(f.question);
    const common = fw.filter((w) => msgWords.includes(w)).length;
    return common > 0 && common / fw.length >= 0.5;
  });
}

// ---------------------------------------------------------------------------

export function replyTo(p: BusinessProfile, message: string): AssistantReply {
  const msg = normalize(message);
  const category = getCategory(p.category);
  const products = findProducts(p.catalog, message);

  // 1. What the owner taught explicitly always wins.
  const learned = findLearned(p, message);
  if (learned) return runAction(p, learned, message);

  // 2. Wants a human → hand over.
  if (has(msg, ['parler*', 'gerant', 'patron', 'humain', 'quelqu un', 'appel*'])) return handoffReply();

  // 3. Negotiation (wholesale, discounts) is the owner's call.
  if (has(msg, ['gros', 'grossiste*', 'reduction', 'remise', 'promo*', 'dernier prix', 'diminue*', 'baisse*'])) {
    return { text: 'Bonne question ! Je demande au responsable et il vous répond très vite.', confident: false };
  }

  // 4. Buying. In Abidjan "payer" often means "acheter": "je veux payer sac".
  const buying = has(msg, ['je veux', 'je voudrais', 'je prends', 'commande*', 'achet*', 'reserv*', 'prendre', 'envoie moi', 'envoyez moi']);
  const payWord = has(msg, ['payer', 'paye']);
  if (buying || (payWord && products.length)) return orderReply(p, products);

  // 5. Products & prices.
  if (products.length) return priceReply(p, products);
  if (has(msg, ['combien', 'cb', 'c combien', 'prix', 'tarif*', 'menu', 'produit*', 'catalogue', 'vous vendez', 'dispo*', 'ya quoi', 'y a quoi', 'vous avez quoi', 'quoi de bon'])) {
    return catalogReply(p);
  }

  // 6. Delivery.
  if (has(msg, ['livr*', 'expedi*', 'envoyer', 'yango', 'coursier'])) return deliveryReply(p, message);

  // 7. Payment ("om" = Orange Money, "momo" = MTN Mobile Money).
  if (payWord || has(msg, ['paiement', 'wave', 'orange', 'om', 'momo', 'moov', 'espece*', 'cash', 'carte'])) return paymentReply(p);

  // 8. Hours.
  if (has(msg, ['heure*', 'ouvert*', 'ferme*', 'horaire*', 'aujourd hui', 'dimanche', 'samedi', 'ce soir'])) {
    return {
      text: p.hours ? `Nos horaires : ${p.hours}.` : 'Je vérifie nos horaires avec le responsable.',
      confident: !!p.hours,
    };
  }

  // 9. Location / socials.
  if (has(msg, ['ou etes', 'etes ou', 'c est ou', 'ou exactement', 'ou se trouve', 'adresse', 'situe*', 'localisation', 'boutique', 'venir', 'vous etes ou'])) {
    if (category?.id === 'restaurant' || hasShop(p)) {
      return { text: `Nous sommes à : ${p.location || 'adresse à confirmer'}.`, confident: !!p.location };
    }
    const socials = [p.tiktok && `TikTok ${p.tiktok}`, p.instagram && `Instagram ${p.instagram}`, p.facebook && `Facebook ${p.facebook}`]
      .filter(Boolean)
      .join(', ');
    return {
      text: `Nous vendons uniquement en ligne${socials ? ` (${socials})` : ''} et nous livrons partout où c’est indiqué. 🛵`,
      confident: true,
    };
  }
  if (has(msg, ['tiktok', 'instagram', 'insta', 'facebook', 'page', 'video*']) && sellsOnline(p)) {
    const socials = [p.tiktok && `TikTok : ${p.tiktok}`, p.instagram && `Instagram : ${p.instagram}`, p.facebook && `Facebook : ${p.facebook}`]
      .filter(Boolean)
      .join('\n');
    return { text: socials || 'Je vous envoie le lien de notre page tout de suite.', confident: !!socials };
  }

  // 10. Small talk.
  if (has(msg, ['bonjour', 'bonsoir', 'salut', 'coucou', 'hello', 'on dit quoi', 'cava', 'ca va', 'yo'])) {
    return { text: `${greeting(p)} Comment puis-je vous aider ?`, confident: true };
  }
  if (has(msg, ['merci', 'ok', 'd accord', 'cool', 'c est bon'])) {
    return { text: 'Avec plaisir ! 🙏🏾', confident: true };
  }

  return {
    text: 'Je ne suis pas sûr de la réponse. Je transmets votre question au responsable, il vous répond très vite.',
    confident: false,
  };
}

export function suggestedQuestions(p: BusinessProfile): string[] {
  const first = p.catalog[0]?.name.split(' ')[0]?.toLowerCase();
  const qs = [
    first ? `C’est combien ${first} ?` : 'C’est combien ?',
    first ? `Je veux payer ${first} oh` : 'Ya quoi de bon ?',
    'Vous livrez à Yopougon ?',
    'Je peux payer par Wave ?',
  ];
  if (getCategory(p.category)?.id === 'restaurant' || hasShop(p)) qs.push('Vous êtes où exactement ?');
  else qs.push('Vous avez une boutique ?');
  qs.push('Vous êtes ouverts dimanche ?');
  return qs;
}
