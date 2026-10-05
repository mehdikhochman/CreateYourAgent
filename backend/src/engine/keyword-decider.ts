/**
 * The offline assistant, used when no ANTHROPIC_API_KEY is set: the
 * prototype's keyword routing (replyTo in prototypes/v2/src/lib/mock-assistant.ts)
 * turned into a Decider. The reply builders are shared with the Claude path.
 */
import { sellsOnline } from '../domain/abidjan';
import type { LearnedAnswer, ShopProfile } from '../domain/types';
import { has, keywords, normalize } from '../domain/text';
import { quoted } from './format';
import { findProducts } from './products';
import type { ChatTurn, DecideInput, DecideResult, Decider, DecisionAction, EngineDecision } from './types';
import { findZone } from './zones';

/** Learned question by exact wording, or sharing at least half of its meaningful words. */
function findLearned(p: ShopProfile, message: string): LearnedAnswer | undefined {
  const msg = normalize(message);
  const msgWords = keywords(message);
  return p.answers.find((a) => {
    if (normalize(a.question) === msg) return true;
    const qw = keywords(a.question);
    const common = qw.filter((w) => msgWords.includes(w)).length;
    return common > 0 && common / qw.length >= 0.5;
  });
}

/** Products the customer talked about in their last few messages (« ok je prends » after « c combien le sac »). */
function productsFromHistory(p: ShopProfile, history: ChatTurn[]): string[] {
  const recent = history.filter((t) => t.role === 'customer').slice(-3).reverse();
  for (const turn of recent) {
    const items = findProducts(p.catalog, turn.text);
    if (items.length) return items.map((i) => i.id);
  }
  return [];
}

const WANTS_HUMAN = ['parler*', 'gerant*', 'patron*', 'humain', 'quelqu un', 'appel*', 'responsable', 'boss'];
const COMPLAINT = [
  'pas content*', 'mecontent*', 'plainte', 'reclamation*', 'rembours*', 'arnaque*',
  'un probleme', 'souci', 'pas recu', 'pas arrive*', 'pas encore arrive*', 'retard',
];
const WHOLESALE = ['gros', 'grossiste*', 'en gros'];
const DISCOUNT = ['reduction*', 'reduc', 'remise*', 'rabais', 'promo*', 'dernier prix', 'diminue*', 'baisse*', 'moins cher'];
const BUYING = ['je veux', 'je voudrais', 'je prends', 'commande*', 'achet*', 'reserv*', 'prendre', 'envoie moi', 'envoyez moi'];
/** « je veux savoir… » asks something, it doesn't buy. */
const ASKING = ['savoir', 'connaitre', 'demander', 'comprendre', 'voir', 'venir'];
const PAY = ['payer', 'paye'];
const PRICE_OR_CATALOG = [
  'combien', 'cb', 'prix', 'tarif*', 'menu', 'produit*', 'catalogue', 'article*', 'modele*', 'vous vendez',
  'vous proposez', 'dispo*', 'ya quoi', 'y a quoi', 'vous avez quoi', 'quoi de bon', 'qu est ce que vous avez',
];
const DELIVERY = ['livr*', 'expedi*', 'envoyer', 'yango', 'coursier', 'deplac*'];
const PAYMENT = ['paiement', 'wave', 'orange', 'om', 'momo', 'mtn', 'moov', 'espece*', 'cash', 'carte', 'mobile money'];
const HOURS = [
  'heure*', 'ouvert*', 'ferme*', 'horaire*', 'aujourd hui', 'ce soir', 'demain',
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche', 'week end',
];
const LOCATION = [
  'ou etes', 'etes ou', 'c est ou', 'ou exactement', 'ou se trouve', 'adresse', 'situe*', 'localisation',
  'boutique', 'magasin', 'venir', 'vous etes ou', 'quartier',
];
const SOCIALS = ['tiktok', 'instagram', 'insta', 'facebook', 'fb', 'page', 'video*', 'lien'];
const GREETINGS = ['bonjour', 'bonsoir', 'salut', 'coucou', 'hello', 'on dit quoi', 'cava', 'ca va', 'yo', 'bjr', 'bsr', 'slt'];
const THANKS = ['merci', 'mrc', 'ok', 'okay', 'd accord', 'dac', 'cool', 'c est bon', 'parfait'];

function decision(action: DecisionAction, extra: Partial<EngineDecision> = {}): EngineDecision {
  return {
    action,
    productIds: [],
    zone: null,
    learnedAnswerId: null,
    lead: null,
    confident: action !== 'handoff',
    alertSummary: null,
    ...extra,
  };
}

/** The prototype's routing, as a decision. Order matters: the first rule that matches wins. */
export function keywordDecision(p: ShopProfile, message: string, history: ChatTurn[] = []): EngineDecision {
  const msg = normalize(message);
  const products = findProducts(p.catalog, message).map((i) => i.id);

  // 1. What the owner taught explicitly always wins.
  const learned = findLearned(p, message);
  if (learned) {
    if (learned.action === 'custom') return decision('custom', { learnedAnswerId: learned.id });
    const ids = learned.productId ? [learned.productId] : products;
    return decision(learned.action, { productIds: ids });
  }

  // 2. Wants a human, or is unhappy → hand over.
  if (has(msg, WANTS_HUMAN)) return decision('handoff');
  if (has(msg, COMPLAINT)) return decision('handoff', { alertSummary: `Réclamation : ${quoted(message, 50)}` });

  // 3. Negotiation (wholesale, discounts) is the owner's call. "-50%" counts too.
  if (has(msg, WHOLESALE)) return decision('handoff', { alertSummary: 'Demande un prix de gros' });
  if (has(msg, DISCOUNT) || /\d\s*%/.test(message)) return decision('handoff', { alertSummary: 'Demande une réduction' });

  // 4. Buying. In Abidjan « payer » often means « acheter »: « je veux payer sac ».
  const strongBuy = has(msg, ['commande*', 'achet*', 'reserv*', 'je prends']);
  const buying = strongBuy || (has(msg, BUYING) && !has(msg, ASKING));
  const payWord = has(msg, PAY);
  if (buying || (payWord && products.length)) {
    return decision('order', { productIds: products.length ? products : productsFromHistory(p, history) });
  }

  // 5. Products and prices.
  if (products.length) return decision('price', { productIds: products });
  if (has(msg, PRICE_OR_CATALOG)) return decision('catalog');

  // 6. Delivery.
  if (has(msg, DELIVERY)) return decision('delivery', { zone: findZone(message) });

  // 7. Payment ("om" = Orange Money, "momo" = MTN Mobile Money).
  if (payWord || has(msg, PAYMENT)) return decision('payment');

  // 8. Hours.
  if (has(msg, HOURS)) return decision('hours');

  // 9. Location, social pages.
  if (has(msg, LOCATION)) return decision('location');
  if (has(msg, SOCIALS) && sellsOnline(p)) return decision('socials');

  // 10. Small talk.
  if (has(msg, GREETINGS)) return decision('greet');
  if (has(msg, THANKS)) return decision('thanks');

  // A place on its own (« Yopougon ? ») is a delivery question.
  const zone = findZone(message);
  if (zone) return decision('delivery', { zone });

  // 11. Dans le doute, passe la main.
  return decision('handoff', { alertSummary: quoted(message) });
}

export class KeywordDecider implements Decider {
  async decide(input: DecideInput): Promise<DecideResult> {
    return { decision: keywordDecision(input.profile, input.message, input.history), model: 'keyword' };
  }
}
