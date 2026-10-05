import { describe, expect, it } from 'vitest';

import type { LearnedAnswer, ShopProfile } from '../domain/types';
import { SilentLogger } from '../test/fakes';
import { createAssistant, FALLBACK_TEXT } from './assistant';
import { AWA_FASHION } from './eval/profiles';
import type { DecideInput, DecideResult, Decider, DecisionAction, EngineDecision } from './types';

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

/** Returns a fixed decision (or throws) and records what it was asked. */
class FakeDecider implements Decider {
  calls: DecideInput[] = [];
  constructor(private readonly result: EngineDecision | Error) {}
  async decide(input: DecideInput): Promise<DecideResult> {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return { decision: this.result, model: 'fake-model', usage: { inputTokens: 1200, outputTokens: 40 } };
  }
}

const learned = (overrides: Partial<LearnedAnswer>): LearnedAnswer => ({
  id: 'la-1',
  question: 'Je veux payer sac oh',
  action: 'order',
  productId: null,
  answer: '',
  source: 'correction',
  ...overrides,
});

const withAnswers = (...answers: LearnedAnswer[]): ShopProfile => ({ ...AWA_FASHION, answers });

const respond = (decider: Decider, message: string, profile: ShopProfile = AWA_FASHION) =>
  createAssistant(decider).respond({ profile, history: [], message });

describe('assistant: learned answers', () => {
  it('runs an exact learned question directly, without calling the decider', async () => {
    const decider = new FakeDecider(decide('handoff'));
    const profile = withAnswers(learned({ question: 'Je veux payer sac oh', action: 'order' }));
    const { reply, meta } = await respond(decider, '  je VEUX payer sac, oh !', profile);
    expect(decider.calls).toHaveLength(0);
    expect(meta).toEqual({ action: 'order', source: 'learned' });
    expect(reply.alert).toEqual({ kind: 'order', summary: 'Veut commander : Sac à main simili cuir' });
  });

  it('quotes the learned product for price, and sends the owner’s words for custom', async () => {
    const decider = new FakeDecider(decide('handoff'));
    const price = await respond(decider, 'le prix svp', withAnswers(learned({ question: 'le prix svp', action: 'price', productId: 'awa-robe' })));
    expect(price.reply.text).toContain('Robe pagne wax');
    expect(price.meta.source).toBe('learned');

    const custom = await respond(
      decider,
      'Vous avez des tailles XXL ?',
      withAnswers(learned({ question: 'Vous avez des tailles XXL ?', action: 'custom', answer: 'Oui, en XXL aussi.' })),
    );
    expect(custom.reply).toEqual({ text: 'Oui, en XXL aussi.', confident: true });
    expect(decider.calls).toHaveLength(0);
  });

  it('asks the decider when the wording is only close', async () => {
    const decider = new FakeDecider(decide('greet'));
    await respond(decider, 'je veux payer sac', withAnswers(learned({ question: 'Je veux payer sac oh' })));
    expect(decider.calls).toHaveLength(1);
  });
});

describe('assistant: decisions', () => {
  it('builds the reply from the decision and reports the model', async () => {
    const decider = new FakeDecider(decide('price', { productIds: ['awa-sac'] }));
    const { reply, meta } = await respond(decider, 'c combien le sac');
    expect(reply.text).toContain('Sac à main simili cuir : **8 500 F**');
    expect(reply.confident).toBe(true);
    expect(reply.alert).toBeUndefined();
    expect(meta).toEqual({ action: 'price', source: 'model', model: 'fake-model', usage: { inputTokens: 1200, outputTokens: 40 } });
    expect(decider.calls[0]).toEqual({ profile: AWA_FASHION, history: [], message: 'c combien le sac' });
  });

  it('drops unknown product ids and says so in meta.guard', async () => {
    const { reply, meta } = await respond(new FakeDecider(decide('order', { productIds: ['awa-sac', 'sac-invente'] })), 'je prends');
    expect(reply.alert).toEqual({ kind: 'order', summary: 'Veut commander : Sac à main simili cuir' });
    expect(meta.guard).toBe('unknown-product');
  });

  it('puts the lead first, and drops a lead with digits', async () => {
    const ok = await respond(new FakeDecider(decide('hours', { lead: 'Bonne question !' })), 'vous ouvrez quand ?');
    expect(ok.reply.text).toBe('Bonne question !\nNos horaires : Lun–Sam · 9h–20h.');

    const digits = await respond(new FakeDecider(decide('hours', { lead: 'Ouvert jusqu’à 22h ce soir !' })), 'ce soir ?');
    expect(digits.reply.text).toBe('Nos horaires : Lun–Sam · 9h–20h.');
    expect(digits.meta.guard).toBe('digits-in-lead');
  });

  it('turns custom without a valid learned answer into a hand-over', async () => {
    const { reply, meta } = await respond(new FakeDecider(decide('custom', { learnedAnswerId: 'invented' })), 'xxl ?');
    expect(meta).toMatchObject({ action: 'handoff', source: 'model', guard: 'unknown-learned-answer' });
    expect(reply.confident).toBe(false);
    expect(reply.alert?.kind).toBe('question');
  });

  it('lets the model’s alert summary replace the builder’s, without changing the kind', async () => {
    const { reply } = await respond(
      new FakeDecider(decide('handoff', { confident: false, alertSummary: 'Demande un prix de gros' })),
      'vous faites prix de gros ?',
    );
    expect(reply.alert).toEqual({ kind: 'question', summary: 'Demande un prix de gros' });

    const order = await respond(new FakeDecider(decide('order', { productIds: ['awa-sac'], alertSummary: 'Veut 3 sacs' })), 'je veux 3 sacs');
    expect(order.reply.alert).toEqual({ kind: 'order', summary: 'Veut 3 sacs' });
  });

  it('never removes the builder’s alert, even when the model is confident', async () => {
    const { reply } = await respond(new FakeDecider(decide('delivery', { zone: 'Abobo', confident: true })), 'Abobo ?');
    expect(reply.confident).toBe(false);
    expect(reply.alert).toEqual({ kind: 'question', summary: 'Demande une livraison à Abobo' });
  });

  it('alerts the owner when the model is unsure', async () => {
    const unsure = await respond(new FakeDecider(decide('catalog', { confident: false })), 'vous avez des trucs pour les enfants ?');
    expect(unsure.reply.confident).toBe(false);
    expect(unsure.reply.alert).toEqual({ kind: 'question', summary: '« vous avez des trucs pour les enfants ? »' });

    const withSummary = await respond(
      new FakeDecider(decide('catalog', { confident: false, alertSummary: 'Cherche des habits pour enfants' })),
      'vous avez des trucs pour les enfants ?',
    );
    expect(withSummary.reply.alert).toEqual({ kind: 'question', summary: 'Cherche des habits pour enfants' });
  });
});

describe('assistant: fallback', () => {
  it('sends the holding reply and alerts the owner when the decider throws', async () => {
    const log = new SilentLogger();
    const message = 'Bonjour, je voudrais savoir si vous avez la robe en rouge et en taille M svp merci beaucoup';
    const { reply, meta } = await createAssistant(new FakeDecider(new Error('overloaded')), log).respond({
      profile: AWA_FASHION,
      history: [],
      message,
    });
    expect(reply).toEqual({
      text: FALLBACK_TEXT,
      confident: false,
      alert: { kind: 'question', summary: `« ${message.slice(0, 60).trim()} »` },
    });
    expect(FALLBACK_TEXT).toBe('Je transmets votre question au responsable, il vous répond très vite.');
    expect(meta).toEqual({ action: 'fallback', source: 'fallback', error: 'overloaded' });
    expect(log.lines.some((l) => l.level === 'warn')).toBe(true);
  });
});
