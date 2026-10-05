/**
 * Safety checks on a decision before a reply is built from it. The decision
 * may come from a model, so nothing in it is trusted: products must exist,
 * the zone must be known, and the free-text lead can't carry a number or a
 * promise.
 */
import type { ShopProfile } from '../domain/types';
import { has, normalize } from '../domain/text';
import { excerpt, singleLine } from './format';
import { DECISION_ACTIONS, type EngineDecision } from './types';
import { canonicalZone } from './zones';

export const LEAD_MAX = 140;
export const ALERT_SUMMARY_MAX = 80;

/** Words a lead must not use: discounts, freebies, confirmations, stock or delay promises. */
const RISKY_LEAD_WORDS = [
  'reduc*', 'remise*', 'rabais', 'promo*', 'gratuit*', 'offert*', 'cadeau*', 'discount',
  'moins cher', 'en stock', 'confirme*', 'paiement recu', 'paiement bien recu', 'garanti*',
];

export type GuardResult = {
  decision: EngineDecision;
  /** What was changed, comma-separated (e.g. 'unknown-product,digits-in-lead'). */
  guard?: string;
};

export function sanitizeDecision(profile: ShopProfile, input: EngineDecision): GuardResult {
  const guards: string[] = [];
  const d: EngineDecision = { ...input, productIds: [...input.productIds] };

  if (!DECISION_ACTIONS.includes(d.action)) {
    guards.push('unknown-action');
    d.action = 'handoff';
    d.confident = false;
  }

  // Products: only available items of this catalogue, each once.
  const valid = new Set(profile.catalog.filter((i) => i.available).map((i) => i.id));
  const productIds = [...new Set(d.productIds)].filter((id) => valid.has(id));
  if (productIds.length !== d.productIds.length) guards.push('unknown-product');
  d.productIds = productIds;

  // Zone: one of ABIDJAN_ZONES, spelled as there.
  if (d.zone !== null) {
    const zone = canonicalZone(d.zone);
    if (!zone) guards.push('unknown-zone');
    d.zone = zone;
  }

  // Custom: the owner's words must exist, else the owner answers.
  if (d.action === 'custom') {
    const answer = profile.answers.find((a) => a.id === d.learnedAnswerId);
    if (!answer || !answer.answer.trim()) {
      guards.push('unknown-learned-answer');
      d.action = 'handoff';
      d.learnedAnswerId = null;
      d.confident = false;
    }
  } else {
    d.learnedAnswerId = null;
  }

  // Lead: one short line, no digits (a price or a delay could hide there), no promise.
  if (d.lead !== null) {
    const lead = singleLine(d.lead);
    if (!lead) {
      d.lead = null;
    } else if (/\d/.test(lead)) {
      guards.push('digits-in-lead');
      d.lead = null;
    } else if (lead.length > LEAD_MAX) {
      guards.push('long-lead');
      d.lead = null;
    } else if (has(normalize(lead), RISKY_LEAD_WORDS)) {
      guards.push('risky-lead');
      d.lead = null;
    } else {
      d.lead = lead;
    }
  }

  if (d.alertSummary !== null) {
    const summary = excerpt(d.alertSummary, ALERT_SUMMARY_MAX);
    d.alertSummary = summary || null;
  }

  return guards.length ? { decision: d, guard: guards.join(',') } : { decision: d };
}
