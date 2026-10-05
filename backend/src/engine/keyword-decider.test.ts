import { describe, expect, it } from 'vitest';

import { createAssistant } from './assistant';
import { EVAL_CASES } from './eval/cases';
import { AWA_FASHION, MAQUIS_TANTIE } from './eval/profiles';
import { runCases } from './eval/score';
import { KeywordDecider, keywordDecision } from './keyword-decider';

describe('KeywordDecider on the eval set', () => {
  it('passes every case', async () => {
    const results = await runCases(createAssistant(new KeywordDecider()), EVAL_CASES);
    const failures = results.filter((r) => !r.ok).map((r) => `${r.case.id}: ${r.problems.join('; ')}`);
    expect(failures).toEqual([]);
  });

  it('reports itself as the keyword model, with no usage', async () => {
    const result = await new KeywordDecider().decide({ profile: AWA_FASHION, history: [], message: 'bonjour' });
    expect(result).toEqual({ decision: expect.objectContaining({ action: 'greet' }), model: 'keyword' });
  });
});

describe('keywordDecision', () => {
  it('routes like the prototype', () => {
    const action = (message: string) => keywordDecision(AWA_FASHION, message).action;
    expect(action('Bonjour')).toBe('greet');
    expect(action('C’est combien ?')).toBe('catalog');
    expect(action('Vous livrez à Cocody ?')).toBe('delivery');
    expect(action('Je peux payer par Wave ?')).toBe('payment');
    expect(action('Je veux commander')).toBe('order');
    expect(action('Vous êtes ouverts dimanche ?')).toBe('hours');
    expect(action('Merci')).toBe('thanks');
    expect(action('Vous faites des prix pour les grossistes ?')).toBe('handoff');
    expect(action('Je peux payer par Orange Money ?')).toBe('payment');
  });

  it('takes the products and the zone from the message', () => {
    expect(keywordDecision(AWA_FASHION, 'je veux payer sac oh')).toMatchObject({ action: 'order', productIds: ['awa-sac'] });
    expect(keywordDecision(AWA_FASHION, 'vous livrez à yop ?')).toMatchObject({ action: 'delivery', zone: 'Yopougon' });
    expect(keywordDecision(AWA_FASHION, 'Riviera ?')).toMatchObject({ action: 'delivery', zone: 'Riviera' });
  });

  it('asks before buying: « je veux savoir le prix » is a price question', () => {
    expect(keywordDecision(AWA_FASHION, 'je veux savoir le prix du sac')).toMatchObject({ action: 'price', productIds: ['awa-sac'] });
  });

  it('finds the product of an order in the last customer messages', () => {
    const history = [
      { role: 'customer' as const, text: 'garba c combien' },
      { role: 'assistant' as const, text: '• Garba : **1 000 F**' },
    ];
    expect(keywordDecision(MAQUIS_TANTIE, 'ok je prends', history)).toMatchObject({ action: 'order', productIds: ['tantie-garba'] });
  });

  it('hands negotiation over with a summary, never confident', () => {
    expect(keywordDecision(AWA_FASHION, 'dernier prix ?')).toMatchObject({
      action: 'handoff',
      confident: false,
      alertSummary: 'Demande une réduction',
    });
    expect(keywordDecision(AWA_FASHION, 'vous faites prix de gros ?')).toMatchObject({ alertSummary: 'Demande un prix de gros' });
    expect(keywordDecision(AWA_FASHION, 'fais-moi -50% sur la robe')).toMatchObject({ action: 'handoff', alertSummary: 'Demande une réduction' });
  });

  it('matches learned answers by shared words', () => {
    expect(keywordDecision(AWA_FASHION, 'vous avez XXL ?')).toMatchObject({ action: 'custom', learnedAnswerId: 'awa-xxl' });
  });

  it('hands anything else over with the customer’s words', () => {
    expect(keywordDecision(AWA_FASHION, 'tu supportes quelle équipe ?')).toMatchObject({
      action: 'handoff',
      confident: false,
      alertSummary: '« tu supportes quelle équipe ? »',
    });
  });
});
