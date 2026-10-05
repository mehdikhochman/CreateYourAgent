/**
 * Everything a route or job needs from the outside world. Production wiring is
 * in src/wiring.ts; tests use the fakes in src/test/fakes.ts.
 *
 * Time: always use `clock.now()` for business logic (takeover windows, OTP
 * expiry, job run times) and pass it to SQL as a parameter. Don't use SQL
 * now() for that, so tests can control time.
 */
import type { Config } from './config';
import type { Db, DbClient } from './db/pool';
import type { Assistant } from './engine/types';

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export interface SmsSender {
  send(phone: string, text: string): Promise<void>;
}

export type PushMessage = {
  /** Expo push token, e.g. ExponentPushToken[xxxx]. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export interface PushSender {
  send(messages: PushMessage[]): Promise<void>;
}

export interface WhatsAppSender {
  /** Sends a text as the shop's number. Returns WhatsApp's message id. */
  sendText(input: { phoneNumberId: string; to: string; text: string }): Promise<{ wamid: string }>;
  /** Marks the customer's message as read and, if asked, shows « … écrit ». Best effort. */
  markRead(input: { phoneNumberId: string; wamid: string; typing: boolean }): Promise<void>;
}

export type EnqueueJob = {
  kind: string;
  payload: Record<string, unknown>;
  /**
   * While a job with this key is waiting, enqueuing the same key again updates
   * its payload and run time instead of adding a second job (debounce).
   */
  key?: string;
  /** Defaults to now. */
  runAt?: Date;
  maxAttempts?: number;
};

export interface JobQueue {
  /**
   * Pass the transaction's client to enqueue atomically with the rows that
   * caused the job (e.g. the customer message), so a job is never lost.
   */
  enqueue(job: EnqueueJob, client?: DbClient): Promise<void>;
}

export type AppDeps = {
  config: Config;
  db: Db;
  clock: Clock;
  log: Logger;
  sms: SmsSender;
  push: PushSender;
  whatsapp: WhatsAppSender;
  assistant: Assistant;
  jobs: JobQueue;
};

export const systemClock: Clock = { now: () => new Date() };

export const consoleLogger: Logger = {
  info: (msg, data) => console.log(JSON.stringify({ level: 'info', msg, ...data })),
  warn: (msg, data) => console.warn(JSON.stringify({ level: 'warn', msg, ...data })),
  error: (msg, data) => console.error(JSON.stringify({ level: 'error', msg, ...data })),
};
