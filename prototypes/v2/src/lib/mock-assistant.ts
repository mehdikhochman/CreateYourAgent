/**
 * Prototype-only assistant: answers from the business profile with simple
 * keyword rules so the app can be tested without a backend.
 *
 * In the real product this module is replaced by a call to our backend,
 * which builds a prompt from the same profile and asks an LLM. Keep the
 * `AssistantReply` shape so screens don't need to change.
 */
import { ABIDJAN_ZONES, getCategory, hasShop, sellsOnline } from '@/data/categories';
import type { AssistantAction, BusinessProfile, CatalogItem, CategoryId, Faq } from '@/state/types';

export type AssistantReply = {
  /** May contain **bold** parts (prices). */
  text: string;
  /** false → the owner is notified that a human should look at it. */
  confident: boolean;
  /** Why the owner is notified, and a one-line summary for the « À traiter » list. */
  alert?: { kind: 'order' | 'question'; summary: string };
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

/** "12 000" → "12 000 F" with non-breaking spaces, so a price never wraps. */
function fcfa(price: string): string {
  return `${price}\u00A0F`.replace(/ /g, '\u00A0');
}

/** Bold price, or « prix sur demande » for a product added without one. */
function priceText(price: string): string {
  return price ? `**${fcfa(price)}**` : 'prix sur demande';
}

function listItems(items: CatalogItem[], max = 8): string {
  return items
    .slice(0, max)
    .map((i) => `• ${i.name} : ${priceText(i.price)}`)
    .join('\n');
}

/** ["a", "b", "c"] → "a, b et c" (or "ou"). */
function joinWords(words: string[], last: 'et' | 'ou'): string {
  return words.length < 2 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} ${last} ${words[words.length - 1]}`;
}

/** "à Cocody", "partout à Abidjan", "à l’intérieur du pays". */
function place(zone: string): string {
  if (zone === 'Tout Abidjan') return 'partout à Abidjan';
  if (zone === 'Intérieur du pays') return 'à l’intérieur du pays';
  return `à ${zone}`;
}

/** Where the shop delivers, as a sentence end: "à Cocody et à Yopougon". */
function deliveryPlaces(zones: string[]): string {
  const everywhere = zones.includes('Tout Abidjan');
  // "Tout Abidjan" already covers each commune.
  const kept = zones.filter((z) => !everywhere || z === 'Tout Abidjan' || z === 'Intérieur du pays');
  return joinWords(kept.map(place), 'et');
}

// Cash and card read as "en espèces" / "par carte bancaire"; the mobile money brands share one "par".
const PAYMENT_WORDS: Record<string, string> = { 'Espèces': 'en espèces', 'Carte bancaire': 'par carte bancaire' };

function paymentMethods(payments: string[]): string {
  const brands = payments.filter((v) => !PAYMENT_WORDS[v]).map((v, i) => (i === 0 ? `par ${v}` : v));
  return joinWords([...brands, ...payments.filter((v) => PAYMENT_WORDS[v]).map((v) => PAYMENT_WORDS[v])], 'ou');
}

function tone(p: BusinessProfile) {
  return p.tone[0] ?? 'amical';
}

function greetingFor(toneValue: string, name: string): string {
  if (toneValue === 'formel') return `Bonjour et bienvenue chez ${name || 'nous'}.`;
  if (toneValue === 'ivoirien') return `Bonne arrivée chez ${name || 'nous'} !`;
  return `Coucou ! Bienvenue chez ${name || 'nous'}.`;
}

function greeting(p: BusinessProfile): string {
  return greetingFor(tone(p), p.name);
}

/** First words of a conversation in a given tone, shown when the owner picks it. */
export function toneSample(toneValue: string, name: string): string {
  return `${greetingFor(toneValue, name)} Comment puis-je vous aider ?`;
}

function greetingReply(p: BusinessProfile): AssistantReply {
  return { text: `${greeting(p)} Comment puis-je vous aider ?`, confident: true };
}

/** Said once per customer, so nobody believes they are chatting with a person. */
function introduction(p: BusinessProfile): string {
  const where = p.category === 'restaurant' ? 'du restaurant' : 'de la boutique';
  return `Je suis l’assistant ${where} : je réponds tout de suite, et une personne prend le relais pour les commandes.`;
}

function signOff(p: BusinessProfile): string {
  if (tone(p) === 'formel') return 'Puis-je vous aider pour autre chose ?';
  if (tone(p) === 'ivoirien') return 'On est ensemble ! Autre chose ?';
  return 'Je peux vous aider pour autre chose ?';
}

// ---------------------------------------------------------------------------
// Actions: each one builds its reply from the profile, so a learned answer
// stays correct when prices, zones or payment methods change.

export const ACTIONS: { id: AssistantAction; label: string }[] = [
  { id: 'catalog', label: 'Montrer le catalogue' },
  { id: 'price', label: 'Donner le prix d’un produit' },
  { id: 'delivery', label: 'Expliquer la livraison' },
  { id: 'payment', label: 'Expliquer le paiement' },
  { id: 'order', label: 'Prendre la commande et me prévenir' },
  { id: 'handoff', label: 'Me passer la main' },
  { id: 'custom', label: 'Écrire ma propre réponse' },
];

const question = (summary: string): AssistantReply['alert'] => ({ kind: 'question', summary });

// A restaurant has a menu and dishes, not a catalogue and products.
const RESTAURANT_LABELS: Partial<Record<AssistantAction, string>> = {
  catalog: 'Montrer le menu',
  price: 'Donner le prix d’un plat',
};

/** The action as the owner reads it (« Me passer la main »). */
export function actionLabel(action: AssistantAction, category?: CategoryId | null): string {
  if (category === 'restaurant' && RESTAURANT_LABELS[action]) return RESTAURANT_LABELS[action];
  return ACTIONS.find((a) => a.id === action)?.label ?? action;
}

/** The same action in Tiko's own words, after a correction (« je vous passerai la main »). */
export function actionPromise(p: BusinessProfile, faq: Pick<Faq, 'action' | 'productId' | 'answer'>): string {
  const restaurant = p.category === 'restaurant';
  switch (faq.action) {
    case 'catalog':
      return restaurant ? 'je montrerai le menu.' : 'je montrerai le catalogue.';
    case 'price': {
      const item = p.catalog.find((i) => i.id === faq.productId);
      return item ? `je donnerai le prix de « ${item.name} ».` : 'je donnerai le prix.';
    }
    case 'delivery':
      return 'j’expliquerai la livraison.';
    case 'payment':
      return 'j’expliquerai le paiement.';
    case 'order':
      return 'je prendrai la commande et je vous préviendrai.';
    case 'handoff':
      return 'je vous passerai la main.';
    case 'custom':
      return `je répondrai : « ${faq.answer} »`;
  }
}

function catalogReply(p: BusinessProfile): AssistantReply {
  const word = getCategory(p.category)?.id === 'restaurant' ? 'notre menu' : 'nos produits';
  if (!p.catalog.length) {
    return { text: 'Je me renseigne et je reviens vers vous très vite.', confident: false, alert: question('Demande le catalogue') };
  }
  return { text: `Voici ${word} :\n${listItems(p.catalog)}\n\n${signOff(p)}`, confident: true };
}

function priceReply(p: BusinessProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) return catalogReply(p);
  return { text: `${listItems(items)}\n\n${signOff(p)}`, confident: true };
}

function deliveryReply(p: BusinessProfile, message = ''): AssistantReply {
  if (!p.deliveryZones.length) return { text: 'Désolé, nous ne faisons pas de livraison pour le moment.', confident: true };
  const fee = p.deliveryFee ? ` Livraison : ${p.deliveryFee}.` : '';
  // Answer about the place the customer named, never a blanket "oui".
  const msg = normalize(message);
  const asked = ABIDJAN_ZONES.find((z) => z.value !== 'Tout Abidjan' && has(msg, [normalize(z.value)]));
  if (asked) {
    const covered = p.deliveryZones.includes(asked.value) || (p.deliveryZones.includes('Tout Abidjan') && asked.value !== 'Intérieur du pays');
    if (!covered) {
      return {
        text: `Pour l’instant, nous ne livrons pas ${place(asked.value)} (nous livrons ${deliveryPlaces(p.deliveryZones)}). Je demande si c’est possible, on vous répond très vite.`,
        confident: false,
        alert: question(`Demande une livraison à ${asked.label}`),
      };
    }
    return { text: `Oui, nous livrons ${place(asked.value)} !${fee}`, confident: true };
  }
  return { text: `Oui, nous livrons ${deliveryPlaces(p.deliveryZones)}.${fee}`, confident: true };
}

function paymentReply(p: BusinessProfile): AssistantReply {
  if (!p.payments.length) {
    return { text: 'Je me renseigne et je reviens vers vous très vite.', confident: false, alert: question('Demande comment payer') };
  }
  return { text: `Vous pouvez payer ${paymentMethods(p.payments)}.`, confident: true };
}

function orderReply(p: BusinessProfile, items: CatalogItem[]): AssistantReply {
  if (!items.length) {
    return {
      text: p.catalog.length
        ? `Avec plaisir ! Vous voulez prendre quoi ? Voici quelques idées :\n${listItems(p.catalog, 5)}`
        : 'Avec plaisir ! Vous voulez prendre quoi ?',
      confident: false,
      alert: { kind: 'order', summary: 'Veut commander' },
    };
  }
  const chosen =
    items.length === 1 ? `${items[0].name} : ${priceText(items[0].price)}.` : `\n${listItems(items)}\n`;
  return {
    text: `Très bon choix ! ${chosen} On vous confirme la commande et la livraison ici très vite.`,
    confident: false,
    alert: { kind: 'order', summary: `Veut commander : ${items.map((i) => i.name).join(', ')}` },
  };
}

function handoffReply(): AssistantReply {
  return {
    text: 'D’accord ! Quelqu’un va vous répondre ici très vite.',
    confident: false,
    alert: question('Veut vous parler'),
  };
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
    return {
      text: 'Bonne question ! Je me renseigne, on vous répond ici très vite.',
      confident: false,
      alert: question(has(msg, ['gros', 'grossiste*']) ? 'Demande un prix de gros' : 'Demande une réduction'),
    };
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
      text: p.hours ? `Nos horaires : ${p.hours}.` : 'Je vérifie nos horaires et je reviens vers vous très vite.',
      confident: !!p.hours,
      alert: p.hours ? undefined : question('Demande vos horaires'),
    };
  }

  // 9. Location / socials.
  if (has(msg, ['ou etes', 'etes ou', 'c est ou', 'ou exactement', 'ou se trouve', 'adresse', 'situe*', 'localisation', 'boutique', 'venir', 'vous etes ou'])) {
    if (category?.id === 'restaurant' || hasShop(p)) {
      return {
        text: p.location ? `Nous sommes à : ${p.location}.` : 'Je vous envoie notre adresse exacte très vite.',
        confident: !!p.location,
        alert: p.location ? undefined : question('Demande votre adresse'),
      };
    }
    const socials = [p.tiktok && `TikTok ${p.tiktok}`, p.instagram && `Instagram ${p.instagram}`, p.facebook && `Facebook ${p.facebook}`]
      .filter(Boolean)
      .join(', ');
    return {
      text: `Nous n’avons pas de boutique : nous vendons en ligne${socials ? ` (${socials})` : ''}${
        p.deliveryZones.length ? ` et nous livrons ${deliveryPlaces(p.deliveryZones)}` : ''
      }.`,
      confident: true,
    };
  }
  if (has(msg, ['tiktok', 'instagram', 'insta', 'facebook', 'page', 'video*']) && sellsOnline(p)) {
    const socials = [p.tiktok && `TikTok : ${p.tiktok}`, p.instagram && `Instagram : ${p.instagram}`, p.facebook && `Facebook : ${p.facebook}`]
      .filter(Boolean)
      .join('\n');
    return {
      text: socials || 'Je vous envoie le lien de notre page tout de suite.',
      confident: !!socials,
      alert: socials ? undefined : question('Demande le lien de votre page'),
    };
  }

  // 10. Small talk.
  if (has(msg, ['bonjour', 'bonsoir', 'salut', 'coucou', 'hello', 'on dit quoi', 'cava', 'ca va', 'yo'])) {
    return greetingReply(p);
  }
  if (has(msg, ['merci', 'ok', 'd accord', 'cool', 'c est bon'])) {
    return { text: 'Avec plaisir !', confident: true };
  }

  return {
    text: 'Je préfère vérifier pour vous donner la bonne réponse. On vous répond ici très vite.',
    confident: false,
    alert: question(`« ${message.trim().slice(0, 60)} »`),
  };
}

/**
 * Reply to a customer. The first reply of a conversation greets and says who
 * is answering, unless the owner turned it off in « Mon assistant ».
 */
export function replyToCustomer(p: BusinessProfile, message: string, firstReply: boolean): AssistantReply {
  const reply = replyTo(p, message);
  if (!firstReply || !p.announceAssistant) return reply;
  // A plain « Bonjour » already gets a greeting: don't greet twice.
  const rest = reply.text === greetingReply(p).text ? 'Comment puis-je vous aider ?' : reply.text;
  return { ...reply, text: `${greeting(p)} ${introduction(p)}\n\n${rest}` };
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
