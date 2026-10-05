/** The assistant engine (design doc §5). */
import type { Config } from '../config';
import { createClaudeDecider } from './claude-decider';
import { KeywordDecider } from './keyword-decider';
import type { Decider } from './types';

export { createAssistant } from './assistant';
export { ClaudeDecider, createClaudeDecider } from './claude-decider';
export { fcfa } from './format';
export { KeywordDecider } from './keyword-decider';
export { buildReply } from './replies';

/** Claude when an API key is set, else the offline keyword rules. */
export function createDecider(config: Pick<Config, 'anthropicApiKey' | 'assistantModel'>): Decider {
  return config.anthropicApiKey ? createClaudeDecider(config) : new KeywordDecider();
}
