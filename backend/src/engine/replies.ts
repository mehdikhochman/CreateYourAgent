/**
 * Reply builders: one per action, ported from prototypes/v2/src/lib/mock-assistant.ts.
 * Every price, zone, hour and payment method comes from the shop's saved
 * profile, so a reply stays correct when the owner edits it and the model can
 * never invent one.
 */
import { hasShop, PAYMENT_OPTIONS } from '../domain/abidjan';
import type { CatalogItem, ShopProfile } from '../domain/types';
import { has, normalize } from '../domain/text';
import type { AlertInfo, AssistantReply, EngineDecision } from './types';
import { listItems, priceText } from './format';
import { findProducts, itemsById } from './products';
import { ALL_ABIDJAN, canonicalZone, findZone, toZone, zoneCovered, type Zone } from './zones';

const question = (summary: string): AlertInfo => ({ kind: 'question', summary });

const isRestaurant = (p: ShopProfile) => p.category === 'restaurant';

function greeting(p: ShopProfile): string {
  const name = p.name.trim() || 'nous';
  if (p.tone === 'formel') return `Bonjour et bienvenue chez ${name}.`;
  if (p.tone === 'ivoirien') return `Bonne arrivée chez ${name} !`;
  return `Coucou ! Bienvenue chez ${name}.`;
}

function signOff(p: ShopProfile): string {
  if (p.tone === 'formel') return 'Puis-je vous aider pour autre chose ?';
  if (p.tone === 'ivoirien') return 'On est ensemble ! Autre chose ?';
  return 'Je peux vous aider pour autre chose ?';
}

function socials(p: ShopProfile, separator: string, colon: string): string {
  return [
    p.tiktok.trim() && `TikTok${colon}${p.tiktok.trim()}`,
    p.instagram.trim() && `Instagram${colon}${p.instagram.trim()}`,
    p.facebook.trim() && `Facebook${colon}${p.facebook.trim()}`,
  ]
    .filter(Boolean)
    .join(separator);
}

const available = (p: ShopProfile) => p.catalog.filter((i) => i.available);

// ---------------------------------------------------------------------------

export function greetReply(p: ShopProfile): AssistantReply {
  return { text: `${greeting(p)} Comment puis-je vous aider ?`, confident: true };
}

export function thanksReply(): AssistantReply {
  return { text: 'Avec plaisir !', confident: true };
}

export function catalogReply(p: ShopProfile): AssistantReply {
  if (!available(p).length) {
    return {
      text: 'Je vérifie avec le responsable et je reviens vers vous.',
      confident: false,
      alert: question('Demande le catalogue'),
    };
  }
  const word = isRestaurant(p) ? 'notre menu' : 'nos produits';
  return { text: `Voici ${word} :\n${listItems(p.catalog)}\n\n${signOff(p)}`, confident: true };
}

export function priceReply(p: ShopProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) return catalogReply(p);
  return { text: `${listItems(items)}\n\n${signOff(p)}`, confident: true };
}

/** Answers about the place the customer named, never a blanket « oui ». */
export function deliveryReply(p: ShopProfile, message: string, zone: Zone | null = null): AssistantReply {
  if (!p.deliveryZones.length) {
    return { text: 'Désolé, nous ne faisons pas de livraison pour le moment.', confident: true };
  }
  const feeText = p.deliveryFee.trim().replace(/\.+$/, '');
  const fee = feeText ? ` Frais de livraison : ${feeText}.` : '';
  const zones = p.deliveryZones.join(', ');
  const asked = zone && zone !== ALL_ABIDJAN ? zone : findZone(message);
  if (asked) {
    if (!zoneCovered(p, asked)) {
      return {
        text: `Désolé, nous ne livrons pas encore ${toZone(asked)}. Nous livrons : ${zones}. Je demande au responsable s’il peut s’arranger.`,
        confident: false,
        alert: question(`Demande une livraison ${toZone(asked)}`),
      };
    }
    return { text: `Oui, nous livrons ${toZone(asked)} !${fee}`, confident: true };
  }
  return { text: `Oui, nous livrons : ${zones}.${fee}`, confident: true };
}

/** How customers name each payment method ("om" = Orange Money, "momo" = MTN). */
const PAYMENT_WORDS: Record<(typeof PAYMENT_OPTIONS)[number], string[]> = {
  Wave: ['wave'],
  'Orange Money': ['om', 'orange'],
  'MTN MoMo': ['momo', 'mtn'],
  'Moov Money': ['moov', 'flooz'],
  Espèces: ['espece*', 'cash', 'liquide'],
  'Carte bancaire': ['carte', 'visa', 'mastercard'],
};

function payBy(method: string): string {
  if (method === 'Espèces') return 'en espèces';
  if (method === 'Carte bancaire') return 'par carte bancaire';
  return `par ${method}`;
}

function methodName(method: string): string {
  if (method === 'Espèces') return 'les espèces';
  if (method === 'Carte bancaire') return 'la carte bancaire';
  return method;
}

export function paymentReply(p: ShopProfile, message = ''): AssistantReply {
  if (!p.payments.length) {
    return { text: 'Je vérifie avec le responsable.', confident: false, alert: question('Demande comment payer') };
  }
  const list = p.payments.join(', ');
  const msg = normalize(message);
  const asked = PAYMENT_OPTIONS.find((m) => has(msg, PAYMENT_WORDS[m]));
  if (asked && p.payments.includes(asked)) {
    return { text: `Oui, vous pouvez payer ${payBy(asked)}. Nous acceptons : ${list}.`, confident: true };
  }
  if (asked) {
    return {
      text: `Désolé, nous n’acceptons pas ${methodName(asked)} pour le moment. Vous pouvez payer par : ${list}.`,
      confident: true,
    };
  }
  return { text: `Vous pouvez payer par : ${list}.`, confident: true };
}

export function hoursReply(p: ShopProfile): AssistantReply {
  const hours = p.hours.trim().replace(/\.+$/, '');
  if (!hours) {
    return { text: 'Je vérifie nos horaires avec le responsable.', confident: false, alert: question('Demande vos horaires') };
  }
  return { text: `Nos horaires : ${hours}.`, confident: true };
}

/** A restaurant or a shop with a counter gives its address; online-only sellers point to their pages. */
export function locationReply(p: ShopProfile): AssistantReply {
  if (isRestaurant(p) || hasShop(p)) {
    const location = p.location.trim().replace(/\.+$/, '');
    if (!location) {
      return { text: 'Nous sommes à : adresse à confirmer.', confident: false, alert: question('Demande votre adresse') };
    }
    return { text: `Nous sommes à : ${location}.`, confident: true };
  }
  const pages = socials(p, ', ', ' ');
  const delivery = p.deliveryZones.length ? ` et nous livrons : ${p.deliveryZones.join(', ')}` : '';
  return { text: `Nous vendons uniquement en ligne${pages ? ` (${pages})` : ''}${delivery}.`, confident: true };
}

export function socialsReply(p: ShopProfile): AssistantReply {
  const pages = socials(p, '\n', ' : ');
  if (!pages) {
    return {
      text: 'Je vous envoie le lien de notre page tout de suite.',
      confident: false,
      alert: question('Demande le lien de votre page'),
    };
  }
  return { text: pages, confident: true };
}

/** The assistant never confirms an order: it notes it and the owner confirms. */
export function orderReply(p: ShopProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) {
    const list = listItems(p.catalog, 5);
    return {
      text: `Avec plaisir ! Qu’est-ce qui vous ferait plaisir ?${list ? `\n${list}` : ''}`,
      confident: false,
      alert: { kind: 'order', summary: 'Veut commander' },
    };
  }
  const [first] = items;
  const chosen = items.length === 1 && first ? ` ${first.name} : ${priceText(first)}. ` : `\n${listItems(items)}\n`;
  return {
    text: `Très bon choix !${chosen}Le responsable vous confirme la commande et la livraison dans quelques minutes.`,
    confident: false,
    alert: { kind: 'order', summary: `Veut commander : ${items.map((i) => i.name).join(', ')}` },
  };
}

export function handoffReply(): AssistantReply {
  return {
    text: 'Je préviens tout de suite le responsable, il vous répond ici très vite.',
    confident: false,
    alert: question('Veut parler au responsable'),
  };
}

/** The owner's own words from a learned answer. */
export function customReply(p: ShopProfile, learnedAnswerId: string | null): AssistantReply {
  const answer = p.answers.find((a) => a.id === learnedAnswerId)?.answer.trim();
  return answer ? { text: answer, confident: true } : handoffReply();
}

// ---------------------------------------------------------------------------

/** Products the decision names, or else those the message names (like the prototype's runAction). */
function chosenItems(p: ShopProfile, decision: EngineDecision, message: string): CatalogItem[] {
  const chosen = itemsById(p.catalog, decision.productIds);
  return chosen.length ? chosen : findProducts(p.catalog, message);
}

/**
 * Builds the reply for a decision. Only the builder's text, confidence and
 * alert: the lead sentence and the model's alert summary are applied by the
 * assistant (assistant.ts).
 */
export function buildReply(profile: ShopProfile, decision: EngineDecision, message: string): AssistantReply {
  switch (decision.action) {
    case 'greet':
      return greetReply(profile);
    case 'thanks':
      return thanksReply();
    case 'catalog':
      return catalogReply(profile);
    case 'price':
      return priceReply(profile, chosenItems(profile, decision, message));
    case 'delivery':
      return deliveryReply(profile, message, canonicalZone(decision.zone));
    case 'payment':
      return paymentReply(profile, message);
    case 'hours':
      return hoursReply(profile);
    case 'location':
      return locationReply(profile);
    case 'socials':
      return socialsReply(profile);
    case 'order':
      return orderReply(profile, chosenItems(profile, decision, message));
    case 'handoff':
      return handoffReply();
    case 'custom':
      return customReply(profile, decision.learnedAnswerId);
  }
}
