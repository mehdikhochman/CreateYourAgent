/**
 * Decider backed by Claude (Haiku 4.5 by default). The model returns a
 * structured decision validated against EngineDecisionSchema; it never writes
 * the reply text.
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import type { Config } from '../config';
import { ABIDJAN_ZONES } from '../domain/abidjan';
import { buildMessages, buildSystemPrompt } from './prompt';
import { DECISION_ACTIONS, type DecideInput, type DecideResult, type Decider, type EngineDecision } from './types';

/**
 * Structured outputs need strict objects: every field is required, and
 * "optional" fields are nullable instead. The zone is a plain string (the SDK
 * only describes enums to the model, and a parse failure would cost the whole
 * decision): the guard maps it onto ABIDJAN_ZONES or drops it.
 */
export const EngineDecisionSchema = z.object({
  action: z.enum(DECISION_ACTIONS).describe('The one action to run.'),
  productIds: z.array(z.string()).describe('Catalogue ids of the products concerned, copied exactly. [] if none.'),
  zone: z
    .string()
    .nullable()
    .describe(`The delivery zone the customer named: one of ${ABIDJAN_ZONES.join(', ')}. null if none.`),
  learnedAnswerId: z.string().nullable().describe('For action custom: the learned answer id. Otherwise null.'),
  lead: z
    .string()
    .nullable()
    .describe('Usually null. One short French sentence shown before the reply: no number, no price, no promise.'),
  confident: z.boolean().describe('false when unsure: the owner is alerted.'),
  alertSummary: z
    .string()
    .nullable()
    .describe('For order and handoff: one short French line for the owner. Otherwise null.'),
});

export const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 1024;

/** The part of the Anthropic client the decider uses, so tests can pass a fake. */
export type ParseClient = { messages: Pick<Anthropic['messages'], 'parse'> };

export type ClaudeDeciderOptions = {
  client: ParseClient;
  model?: string;
  /** Per-request timeout in ms, on top of the client's own. */
  timeoutMs?: number;
};

export class ClaudeDecider implements Decider {
  private readonly client: ParseClient;
  private readonly model: string;
  private readonly timeoutMs?: number;

  constructor(opts: ClaudeDeciderOptions) {
    this.client = opts.client;
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs;
  }

  async decide(input: DecideInput): Promise<DecideResult> {
    const response = await this.client.messages.parse(
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system: [{ type: 'text', text: buildSystemPrompt(input.profile), cache_control: { type: 'ephemeral' } }],
        messages: buildMessages(input.history, input.message),
        output_config: { format: zodOutputFormat(EngineDecisionSchema) },
      },
      this.timeoutMs ? { timeout: this.timeoutMs } : undefined,
    );

    if (response.stop_reason === 'refusal') throw new Error('claude refused to answer (stop_reason refusal)');
    if (response.stop_reason === 'max_tokens' || response.stop_reason === 'model_context_window_exceeded') {
      throw new Error(`claude output was cut (stop_reason ${response.stop_reason})`);
    }
    const parsed = response.parsed_output;
    if (!parsed) throw new Error(`claude returned no decision (stop_reason ${response.stop_reason ?? 'null'})`);

    const decision: EngineDecision = {
      action: parsed.action,
      productIds: parsed.productIds,
      zone: parsed.zone,
      learnedAnswerId: parsed.learnedAnswerId,
      lead: parsed.lead,
      confident: parsed.confident,
      alertSummary: parsed.alertSummary,
    };
    const u = response.usage;
    return {
      decision,
      model: response.model || this.model,
      usage: {
        // All input tokens, cached or not.
        inputTokens: u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
        outputTokens: u.output_tokens,
      },
    };
  }
}

/**
 * The real client. Claude is called from the reply job, so a request gets
 * 12 s and one retry: about 25 s in the worst case before the customer gets
 * the holding reply (design doc §4, step 9).
 */
export function createClaudeDecider(config: Pick<Config, 'anthropicApiKey' | 'assistantModel'>): ClaudeDecider {
  const client = new Anthropic({ apiKey: config.anthropicApiKey, timeout: 12_000, maxRetries: 1 });
  return new ClaudeDecider({ client, model: config.assistantModel || DEFAULT_MODEL });
}
