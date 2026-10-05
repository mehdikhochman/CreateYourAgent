import { describe, expect, it } from 'vitest';

import { AWA_FASHION } from './eval/profiles';
import { sanitizeDecision } from './guard';
import type { DecisionAction, EngineDecision } from './types';

const decide = (action: DecisionAction, extra: Partial<EngineDecision> = {}): EngineDecision => ({
  action,
  productIds: [],
  zone: null,
  learnedAnswerId: null,
  lead: null,
  confident: true,
  alertSummary: null,
  ...extra,
});

describe('sanitizeDecision', () => {
  it('leaves a clean decision untouched', () => {
    const d = decide('price', { productIds: ['awa-sac'], lead: 'Ah, bon choix !' });
    expect(sanitizeDecision(AWA_FASHION, d)).toEqual({ decision: d });
  });

  it('drops product ids that are unknown, unavailable or repeated', () => {
    const { decision, guard } = sanitizeDecision(
      AWA_FASHION,
      decide('order', { productIds: ['awa-sac', 'invented', 'awa-perruque', 'awa-sac'] }),
    );
    expect(decision.productIds).toEqual(['awa-sac']);
    expect(guard).toBe('unknown-product');
  });

  it('keeps known zones (any spelling), drops the others', () => {
    expect(sanitizeDecision(AWA_FASHION, decide('delivery', { zone: 'Yopougon' })).decision.zone).toBe('Yopougon');
    expect(sanitizeDecision(AWA_FASHION, decide('delivery', { zone: 'yop' })).decision.zone).toBe('Yopougon');
    expect(sanitizeDecision(AWA_FASHION, decide('delivery', { zone: 'PORT-BOUET' })).decision.zone).toBe('Port-Bouët');
    const unknown = sanitizeDecision(AWA_FASHION, decide('delivery', { zone: 'Paris' }));
    expect(unknown.decision.zone).toBeNull();
    expect(unknown.guard).toBe('unknown-zone');
  });

  it('turns custom without a valid learned answer into a hand-over', () => {
    for (const learnedAnswerId of [null, 'invented']) {
      const { decision, guard } = sanitizeDecision(AWA_FASHION, decide('custom', { learnedAnswerId }));
      expect(decision).toMatchObject({ action: 'handoff', confident: false, learnedAnswerId: null });
      expect(guard).toBe('unknown-learned-answer');
    }
    const empty = { ...AWA_FASHION, answers: [{ ...AWA_FASHION.answers[0]!, answer: '  ' }] };
    expect(sanitizeDecision(empty, decide('custom', { learnedAnswerId: 'awa-xxl' })).decision.action).toBe('handoff');
    expect(sanitizeDecision(AWA_FASHION, decide('custom', { learnedAnswerId: 'awa-xxl' })).decision.action).toBe('custom');
  });

  it('clears learnedAnswerId for other actions', () => {
    expect(sanitizeDecision(AWA_FASHION, decide('price', { learnedAnswerId: 'awa-xxl' })).decision.learnedAnswerId).toBeNull();
  });

  it('keeps the lead on one trimmed line', () => {
    const { decision } = sanitizeDecision(AWA_FASHION, decide('greet', { lead: '  Ah,\n  merci   pour votre message ! ' }));
    expect(decision.lead).toBe('Ah, merci pour votre message !');
    expect(sanitizeDecision(AWA_FASHION, decide('greet', { lead: '   ' })).decision.lead).toBeNull();
  });

  it('drops a lead with any digit', () => {
    const { decision, guard } = sanitizeDecision(AWA_FASHION, decide('price', { productIds: ['awa-sac'], lead: 'Pour vous, 5000 F seulement !' }));
    expect(decision.lead).toBeNull();
    expect(decision.productIds).toEqual(['awa-sac']);
    expect(guard).toBe('digits-in-lead');
  });

  it('drops a lead that is too long or promises something', () => {
    expect(sanitizeDecision(AWA_FASHION, decide('greet', { lead: 'a'.repeat(141) })).guard).toBe('long-lead');
    expect(sanitizeDecision(AWA_FASHION, decide('greet', { lead: 'a'.repeat(140) })).decision.lead).toHaveLength(140);
    for (const lead of ['Je vous fais une petite réduction !', 'La livraison est gratuite pour vous.', 'C’est confirmé !']) {
      const r = sanitizeDecision(AWA_FASHION, decide('order', { lead }));
      expect(r.decision.lead).toBeNull();
      expect(r.guard).toBe('risky-lead');
    }
  });

  it('cuts the alert summary to 80 characters, on one line', () => {
    const { decision } = sanitizeDecision(AWA_FASHION, decide('handoff', { alertSummary: `  Demande\n${'x'.repeat(200)}` }));
    expect(decision.alertSummary).toHaveLength(80);
    expect(decision.alertSummary).not.toContain('\n');
    expect(sanitizeDecision(AWA_FASHION, decide('handoff', { alertSummary: ' ' })).decision.alertSummary).toBeNull();
  });

  it('reports every change', () => {
    const { guard } = sanitizeDecision(AWA_FASHION, decide('custom', { productIds: ['x'], zone: 'Lyon', lead: '50 %' }));
    expect(guard).toBe('unknown-product,unknown-zone,unknown-learned-answer,digits-in-lead');
  });

  it('does not change the decision it was given', () => {
    const d = decide('order', { productIds: ['invented'] });
    sanitizeDecision(AWA_FASHION, d);
    expect(d.productIds).toEqual(['invented']);
  });
});
