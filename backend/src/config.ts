import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  OTP_SECRET: z.string().min(32, 'OTP_SECRET must be at least 32 characters'),
  /** "+2250700000000:123456,+2250500000000:654321" */
  AUTH_TEST_CODES: optional,

  META_APP_SECRET: optional,
  META_VERIFY_TOKEN: optional,
  META_ACCESS_TOKEN: optional,
  META_GRAPH_VERSION: z.string().default('v24.0'),

  ANTHROPIC_API_KEY: optional,
  ASSISTANT_MODEL: z.string().default('claude-haiku-4-5'),

  EXPO_ACCESS_TOKEN: optional,

  REPLY_DEBOUNCE_SECONDS: z.coerce.number().min(0).default(4),
});

export type Config = {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  otpSecret: string;
  /** Phone (E.164) → fixed code. These numbers never receive an SMS. */
  authTestCodes: Map<string, string>;
  meta: {
    appSecret?: string;
    verifyToken?: string;
    accessToken?: string;
    graphVersion: string;
  };
  anthropicApiKey?: string;
  assistantModel: string;
  expoAccessToken?: string;
  replyDebounceSeconds: number;
};

function parseTestCodes(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  if (!raw) return map;
  for (const pair of raw.split(',')) {
    const [phone, code] = pair.split(':').map((s) => s.trim());
    if (!phone || !code) continue;
    if (!/^\d{6}$/.test(code)) throw new Error(`AUTH_TEST_CODES: code for ${phone} must be 6 digits`);
    map.set(phone.replace(/[\s.-]/g, ''), code);
  }
  return map;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration (check your .env):\n${issues}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwtSecret: e.JWT_SECRET,
    otpSecret: e.OTP_SECRET,
    authTestCodes: parseTestCodes(e.AUTH_TEST_CODES),
    meta: {
      appSecret: e.META_APP_SECRET,
      verifyToken: e.META_VERIFY_TOKEN,
      accessToken: e.META_ACCESS_TOKEN,
      graphVersion: e.META_GRAPH_VERSION,
    },
    anthropicApiKey: e.ANTHROPIC_API_KEY,
    assistantModel: e.ASSISTANT_MODEL,
    expoAccessToken: e.EXPO_ACCESS_TOKEN,
    replyDebounceSeconds: e.REPLY_DEBOUNCE_SECONDS,
  };
}
