import { ConsoleSmsSender } from './auth/sms';
import type { Config } from './config';
import { createPool } from './db/pool';
import { type AppDeps, consoleLogger, systemClock, type WhatsAppSender } from './deps';
import { createAssistant, createDecider } from './engine';
import { PgJobQueue } from './jobs/queue';
import { ExpoPushSender } from './push/expo';
import { MetaCloudSender } from './whatsapp/meta-sender';

/** Real dependencies for the API server and the worker. */
export function createDeps(config: Config): AppDeps {
  const log = consoleLogger;
  const clock = systemClock;
  const db = createPool(config.databaseUrl);

  const decider = createDecider(config);
  log.info(config.anthropicApiKey ? 'assistant: Claude' : 'assistant: offline keyword rules (no ANTHROPIC_API_KEY)', {
    model: config.anthropicApiKey ? config.assistantModel : 'keyword',
  });

  return {
    config,
    db,
    clock,
    log,
    // Stage 1 has no SMS provider: codes are printed in the server logs.
    sms: new ConsoleSmsSender(log),
    push: new ExpoPushSender({ accessToken: config.expoAccessToken, log }),
    whatsapp: config.meta.accessToken
      ? new MetaCloudSender({ accessToken: config.meta.accessToken, graphVersion: config.meta.graphVersion, log })
      : missingWhatsApp(log),
    assistant: createAssistant(decider, log),
    jobs: new PgJobQueue(db, clock),
  };
}

/** Lets the API start without Meta credentials; sending then fails with a clear message. */
function missingWhatsApp(log: AppDeps['log']): WhatsAppSender {
  const fail = async (): Promise<never> => {
    throw new Error('META_ACCESS_TOKEN is not set: cannot send WhatsApp messages');
  };
  log.warn('META_ACCESS_TOKEN is not set: WhatsApp replies will fail until you add it to .env');
  return { sendText: fail, markRead: async () => {} };
}
