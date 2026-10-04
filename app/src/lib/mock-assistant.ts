/**
 * Prototype-only assistant: answers from the business profile with simple
 * keyword rules so the app can be tested without a backend.
 *
 * In the real product this module is replaced by a call to our backend,
 * which builds a prompt from the same profile and asks an LLM. Keep the
 * `AssistantReply` shape so screens don't need to change.
 */
import { getCategory, hasShop, sellsOnline } from '@/data/categories';
import type { BusinessProfile, CatalogItem } from '@/state/types';

export type AssistantReply = {
  text: string;
  /** false → the owner is notified that a human should look at it. */
  confident: boolean;
};

const STOP_WORDS = new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'de', 'du', 'et', 'a', 'au', 'aux', 'en',
  'est', 'c', 'ce', 'ca', 'vous', 'je', 'tu', 'il', 'on', 'nous', 'mon', 'ma', 'mes',
  'votre', 'vos', 'pour', 'avec', 'sur', 'pas', 'que', 'qui', 'quoi', 'svp', 's',
  'y', 'avez', 'combien', 'prix', 'bonjour', 'bonsoir', 'merci', 'est-ce', 'l', 'd',
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

function has(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

function findProducts(catalog: CatalogItem[], message: string): CatalogItem[] {
  const words = keywords(message);
  return catalog.filter((item) => {
    const itemWords = keywords(item.name);
    return words.some((w) => itemWords.some((iw) => iw.startsWith(w) || w.startsWith(iw)));
  });
}

function listItems(items: CatalogItem[], max = 5): string {
  return items
    .slice(0, max)
    .map((i) => `• ${i.name} : ${i.price} F`)
    .join('\n');
}

function greeting(p: BusinessProfile): string {
  const tone = p.tone[0] ?? 'amical';
  if (tone === 'formel') return `Bonjour et bienvenue chez ${p.name || 'nous'}.`;
  if (tone === 'ivoirien') return `Bonne arrivée chez ${p.name || 'nous'} ! 🙌🏾`;
  return `Coucou ! Bienvenue chez ${p.name || 'nous'} 😊`;
}

function signOff(p: BusinessProfile): string {
  const tone = p.tone[0] ?? 'amical';
  if (tone === 'formel') return 'Puis-je vous aider pour autre chose ?';
  if (tone === 'ivoirien') return 'On est ensemble ! Autre chose ?';
  return 'Je peux vous aider pour autre chose ? 😊';
}

export function replyTo(p: BusinessProfile, message: string): AssistantReply {
  const msg = normalize(message);
  const category = getCategory(p.category);
  const catalogWord = category?.id === 'restaurant' ? 'menu' : 'produits';

  // 1. Answers the owner taught explicitly win.
  const msgWords = keywords(message);
  const faq = p.faqs.find((f) => {
    const fw = keywords(f.question);
    const common = fw.filter((w) => msgWords.includes(w)).length;
    return normalize(f.question) === msg || (common > 0 && common / fw.length >= 0.5);
  });
  if (faq) return { text: faq.answer, confident: true };

  // 2. Wants a human or wants to order → hand over to the owner.
  if (has(msg, ['parler', 'gerant', 'patron', 'humain', 'quelqu un', 'appeler'])) {
    return {
      text: 'Je préviens tout de suite le responsable, il vous répond ici très vite. 🙏🏾',
      confident: false,
    };
  }
  if (has(msg, ['commander', 'commande', 'je veux', 'je prends', 'reserver', 'reservation'])) {
    const products = findProducts(p.catalog, message);
    const what = products.length ? ` (${products.map((x) => x.name).join(', ')})` : '';
    return {
      text: `Parfait, je note votre demande${what} ! Le responsable vous confirme la commande et le paiement dans quelques minutes.`,
      confident: false,
    };
  }

  // Negotiation (wholesale, discounts) is the owner's call.
  if (has(msg, ['gros', 'grossiste', 'reduction', 'remise', 'promo', 'discuter le prix', 'dernier prix'])) {
    return {
      text: 'Bonne question ! Je demande au responsable et il vous répond très vite.',
      confident: false,
    };
  }

  // 3. Products & prices.
  const products = findProducts(p.catalog, message);
  if (products.length) {
    return { text: `${listItems(products)}\n\n${signOff(p)}`, confident: true };
  }
  if (has(msg, ['combien', 'prix', 'tarif', 'menu', 'produit', 'catalogue', 'vous vendez', 'disponible'])) {
    if (!p.catalog.length) {
      return { text: 'Je vérifie avec le responsable et je reviens vers vous.', confident: false };
    }
    return {
      text: `Voici nos ${catalogWord} :\n${listItems(p.catalog, 8)}\n\n${signOff(p)}`,
      confident: true,
    };
  }

  // 4. Delivery.
  if (has(msg, ['livr', 'livraison', 'expedi', 'envoyer'])) {
    if (!p.deliveryZones.length) {
      return { text: 'Désolé, nous ne faisons pas de livraison pour le moment.', confident: true };
    }
    const fee = p.deliveryFee ? ` Frais de livraison : ${p.deliveryFee}.` : '';
    return {
      text: `Oui, nous livrons : ${p.deliveryZones.join(', ')}.${fee}`,
      confident: true,
    };
  }

  // 5. Payment.
  if (has(msg, ['payer', 'paiement', 'wave', 'orange', 'momo', 'moov', 'espece', 'carte'])) {
    if (!p.payments.length) return { text: 'Je vérifie avec le responsable.', confident: false };
    return { text: `Vous pouvez payer par : ${p.payments.join(', ')}.`, confident: true };
  }

  // 6. Hours.
  if (has(msg, ['heure', 'ouvert', 'ferme', 'horaire', 'aujourd hui', 'dimanche'])) {
    return {
      text: p.hours ? `Nos horaires : ${p.hours}.` : 'Je vérifie nos horaires avec le responsable.',
      confident: !!p.hours,
    };
  }

  // 7. Location / socials.
  if (has(msg, ['ou etes', 'etes ou', 'c est ou', 'ou exactement', 'ou se trouve', 'adresse', 'situe', 'localisation', 'boutique', 'venir'])) {
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
  if (has(msg, ['tiktok', 'instagram', 'insta', 'facebook', 'page', 'video']) && sellsOnline(p)) {
    const socials = [p.tiktok && `TikTok : ${p.tiktok}`, p.instagram && `Instagram : ${p.instagram}`, p.facebook && `Facebook : ${p.facebook}`]
      .filter(Boolean)
      .join('\n');
    return { text: socials || 'Je vous envoie le lien de notre page tout de suite.', confident: !!socials };
  }

  // 8. Small talk.
  if (has(msg, ['bonjour', 'bonsoir', 'salut', 'coucou', 'hello', 'on dit quoi', 'cava', 'ca va'])) {
    return { text: `${greeting(p)} Comment puis-je vous aider ?`, confident: true };
  }
  if (has(msg, ['merci', 'ok', 'd accord', 'cool'])) {
    return { text: 'Avec plaisir ! 🙏🏾', confident: true };
  }

  return {
    text: 'Je ne suis pas sûr de la réponse. Je transmets votre question au responsable, il vous répond très vite.',
    confident: false,
  };
}

export function suggestedQuestions(p: BusinessProfile): string[] {
  const first = p.catalog[0]?.name.split(' ')[0];
  const qs = [
    first ? `C’est combien ${first.toLowerCase()} ?` : 'C’est combien ?',
    'Vous livrez à Yopougon ?',
    'Je peux payer par Wave ?',
  ];
  if (getCategory(p.category)?.id === 'restaurant' || hasShop(p)) qs.push('Vous êtes où exactement ?');
  else qs.push('Vous avez une boutique ?');
  qs.push('Vous êtes ouverts dimanche ?');
  return qs;
}
