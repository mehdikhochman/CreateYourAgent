/**
 * The assistant (design doc §5): learned answers first, then the decider
 * chooses an action, the guard checks it, and the reply is built from the
 * shop's saved data. It never stays silent: if the decider fails, the
 * customer gets a holding reply and the owner an alert.
 */
import type { Logger } from '../deps';
import type { LearnedAnswer, ShopProfile } from '../domain/types';
import { normalize } from '../domain/text';
import { quoted } from './format';
import { sanitizeDecision } from './guard';
import { buildReply } from './replies';
import type { Assistant, AssistantReply, DecideInput, Decider, EngineDecision, EngineResult } from './types';

export const FALLBACK_TEXT = 'Je transmets votre question au responsable, il vous répond très vite.';

/** The learned answer whose question is exactly the message, after normalisation. */
export function exactLearned(profile: ShopProfile, message: string): LearnedAnswer | undefined {
  const msg = normalize(message);
  if (!msg) return undefined;
  return profile.answers.find((a) => normalize(a.question) === msg);
}

/** What the owner taught, as a decision. */
export function learnedDecision(answer: LearnedAnswer): EngineDecision {
  return {
    action: answer.action,
    productIds: answer.productId ? [answer.productId] : [],
    zone: null,
    learnedAnswerId: answer.action === 'custom' ? answer.id : null,
    lead: null,
    confident: true,
    alertSummary: null,
  };
}

/**
 * Applies the model's extras to the built reply: the lead goes first, its
 * alert summary replaces the builder's (an alert is never removed), and an
 * unsure decision always alerts the owner.
 */
function finish(built: AssistantReply, decision: EngineDecision, message: string): AssistantReply {
  const reply: AssistantReply = {
    text: decision.lead ? `${decision.lead}\n${built.text}` : built.text,
    confident: built.confident && decision.confident,
  };
  if (built.alert) {
    reply.alert = { kind: built.alert.kind, summary: decision.alertSummary ?? built.alert.summary };
  } else if (!decision.confident) {
    reply.alert = { kind: 'question', summary: decision.alertSummary ?? quoted(message) };
  }
  return reply;
}

export function createAssistant(decider: Decider, log?: Logger): Assistant {
  return {
    async respond(input: DecideInput): Promise<EngineResult> {
      const { profile, message } = input;

      // 1. What the owner taught always wins, with no model call.
      const learned = exactLearned(profile, message);
      if (learned) {
        const { decision, guard } = sanitizeDecision(profile, learnedDecision(learned));
        const reply = finish(buildReply(profile, decision, message), decision, message);
        return { reply, meta: { action: decision.action, source: 'learned', ...(guard && { guard }) } };
      }

      // 2. The decider chooses, the guard checks, the builders write.
      try {
        const result = await decider.decide(input);
        const { decision, guard } = sanitizeDecision(profile, result.decision);
        if (guard) log?.info('assistant: guard changed the decision', { shopId: profile.shopId, guard, model: result.model });
        const reply = finish(buildReply(profile, decision, message), decision, message);
        return {
          reply,
          meta: {
            action: decision.action,
            source: 'model',
            model: result.model,
            ...(result.usage && { usage: result.usage }),
            ...(guard && { guard }),
          },
        };
      } catch (err) {
        // 3. Never stay silent.
        const error = err instanceof Error ? err.message : String(err);
        log?.warn('assistant: decider failed, sending the holding reply', { shopId: profile.shopId, error });
        return {
          reply: { text: FALLBACK_TEXT, confident: false, alert: { kind: 'question', summary: quoted(message) } },
          meta: { action: 'fallback', source: 'fallback', error },
        };
      }
    },
  };
}
