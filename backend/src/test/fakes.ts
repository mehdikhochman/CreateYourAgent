import type { Config } from '../config';
import type { Db } from '../db/pool';
import type {
  AppDeps,
  Clock,
  EnqueueJob,
  JobQueue,
  Logger,
  PushMessage,
  PushSender,
  SmsSender,
  WhatsAppSender,
} from '../deps';
import type { Assistant, DecideInput, EngineResult } from '../engine/types';

export const TEST_JWT_SECRET = 'test-jwt-secret-test-jwt-secret-0123456789';

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    nodeEnv: 'test',
    port: 0,
    databaseUrl: 'unused-in-tests',
    jwtSecret: TEST_JWT_SECRET,
    otpSecret: 'test-otp-secret-test-otp-secret-0123456789',
    authTestCodes: new Map(),
    meta: {
      appSecret: 'test-meta-app-secret',
      verifyToken: 'test-verify-token',
      accessToken: 'test-access-token',
      graphVersion: 'v24.0',
    },
    anthropicApiKey: undefined,
    assistantModel: 'claude-haiku-4-5',
    expoAccessToken: undefined,
    replyDebounceSeconds: 4,
    ...overrides,
  };
}

/** A clock tests can move: `clock.set('2026-10-05T10:00:00Z')`, `clock.advance(60_000)`. */
export class FakeClock implements Clock {
  private t: number;
  constructor(start: string | Date = '2026-10-05T10:00:00.000Z') {
    this.t = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  set(at: string | Date) {
    this.t = new Date(at).getTime();
  }
  advance(ms: number) {
    this.t += ms;
  }
}

export class FakeSms implements SmsSender {
  sent: { phone: string; text: string }[] = [];
  async send(phone: string, text: string) {
    this.sent.push({ phone, text });
  }
}

export class FakePush implements PushSender {
  sent: PushMessage[] = [];
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
  }
}

export class FakeWhatsApp implements WhatsAppSender {
  sent: { phoneNumberId: string; to: string; text: string; wamid: string }[] = [];
  reads: { phoneNumberId: string; wamid: string; typing: boolean }[] = [];
  /** Set to make the next sendText calls throw. */
  failWith: Error | null = null;
  private n = 0;
  async sendText(input: { phoneNumberId: string; to: string; text: string }) {
    if (this.failWith) throw this.failWith;
    this.n += 1;
    const wamid = `wamid.out.${this.n}`;
    this.sent.push({ ...input, wamid });
    return { wamid };
  }
  async markRead(input: { phoneNumberId: string; wamid: string; typing: boolean }) {
    this.reads.push(input);
  }
}

export class FakeJobQueue implements JobQueue {
  jobs: EnqueueJob[] = [];
  async enqueue(job: EnqueueJob) {
    this.jobs.push(job);
  }
}

/** Assistant that returns a fixed or computed result and records its inputs. */
export class FakeAssistant implements Assistant {
  calls: DecideInput[] = [];
  constructor(
    private readonly impl: (input: DecideInput) => EngineResult | Promise<EngineResult> = () => ({
      reply: { text: 'Bonjour ! Comment puis-je vous aider ?', confident: true },
      meta: { action: 'greet', source: 'model', model: 'fake' },
    }),
  ) {}
  async respond(input: DecideInput) {
    this.calls.push(input);
    return this.impl(input);
  }
}

export class SilentLogger implements Logger {
  lines: { level: string; msg: string; data?: Record<string, unknown> }[] = [];
  info(msg: string, data?: Record<string, unknown>) {
    this.lines.push({ level: 'info', msg, data });
  }
  warn(msg: string, data?: Record<string, unknown>) {
    this.lines.push({ level: 'warn', msg, data });
  }
  error(msg: string, data?: Record<string, unknown>) {
    this.lines.push({ level: 'error', msg, data });
  }
}

export type TestDeps = AppDeps & {
  clock: FakeClock;
  sms: FakeSms;
  push: FakePush;
  whatsapp: FakeWhatsApp;
  assistant: FakeAssistant;
  jobs: FakeJobQueue;
  log: SilentLogger;
};

/** Deps with fakes everywhere except the database. Override any field. */
export function makeTestDeps(db: Db, overrides: Partial<TestDeps> = {}): TestDeps {
  return {
    config: testConfig(),
    db,
    clock: new FakeClock(),
    log: new SilentLogger(),
    sms: new FakeSms(),
    push: new FakePush(),
    whatsapp: new FakeWhatsApp(),
    assistant: new FakeAssistant(),
    jobs: new FakeJobQueue(),
    ...overrides,
  };
}
