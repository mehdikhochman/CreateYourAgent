/**
 * Contract of the assistant engine (docs/architecture/BACKEND_SYSTEM_DESIGN.md §5).
 *
 * The model only *chooses* (an action and the products or zone concerned).
 * The reply text is built from the shop's saved data, so prices, zones and
 * hours are never written by the model.
 */
import type { MessageRole, ShopProfile } from '../domain/types';

export type ChatTurn = { role: MessageRole; text: string };

export type AlertInfo = { kind: 'order' | 'question'; summary: string };

/** Same shape as the prototype's AssistantReply, so app screens don't change. */
export type AssistantReply = {
  /** May contain **bold** parts (prices). */
  text: string;
  /** false → the owner is notified that a human should look at it. */
  confident: boolean;
  /** Why the owner is notified, and a one-line summary for « À traiter ». */
  alert?: AlertInfo;
};

export const DECISION_ACTIONS = [
  'greet',
  'thanks',
  'catalog',
  'price',
  'delivery',
  'payment',
  'hours',
  'location',
  'socials',
  'order',
  'handoff',
  'custom',
] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

export type EngineDecision = {
  action: DecisionAction;
  /** Must exist in the shop's catalogue; unknown ids are dropped. */
  productIds: string[];
  /** Must be one of ABIDJAN_ZONES; anything else is treated as null. */
  zone: string | null;
  /** For action 'custom': the learned answer whose words to send. */
  learnedAnswerId: string | null;
  /** One short natural sentence placed before the built reply. Never contains digits. */
  lead: string | null;
  confident: boolean;
  alertSummary: string | null;
};

export type DecideInput = {
  profile: ShopProfile;
  /** Earlier turns of the conversation, oldest first, without the current message. */
  history: ChatTurn[];
  /** The customer's message (or burst of messages joined by newlines). */
  message: string;
};

export type TokenUsage = { inputTokens: number; outputTokens: number };

export type DecideResult = {
  decision: EngineDecision;
  /** 'keyword' for the offline decider. */
  model: string;
  usage?: TokenUsage;
};

/** Chooses what to do with a customer message. Implemented by Claude, the offline keyword rules, and test fakes. */
export interface Decider {
  decide(input: DecideInput): Promise<DecideResult>;
}

export type EngineMeta = {
  /** The action actually run (a DecisionAction, or 'fallback'). */
  action: string;
  /** learned = exact match on a learned answer, no model call. fallback = the decider failed. */
  source: 'learned' | 'model' | 'fallback';
  model?: string;
  usage?: TokenUsage;
  /** Set when a safety check changed the decision, e.g. 'unknown-number-in-lead'. */
  guard?: string;
  error?: string;
};

export type EngineResult = { reply: AssistantReply; meta: EngineMeta };

/** What the rest of the backend calls. Built from a Decider by the engine module. */
export interface Assistant {
  respond(input: DecideInput): Promise<EngineResult>;
}
