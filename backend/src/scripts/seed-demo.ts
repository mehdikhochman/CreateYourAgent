/**
 * Creates (or resets) the demo shop « Awa Fashion » and links it to a WhatsApp
 * number. Safe to run several times.
 *
 *   npm run seed -- --phone +2250700000000 --phone-number-id 123456789012345 --display-phone "+1 555 0100"
 *
 * Reads backend/.env (variables already set in the shell win).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { type Config, loadConfig } from '../config';
import { createPool } from '../db/pool';
import { systemClock } from '../deps';
import { normalizePhone } from '../domain/phone';
import { DEMO_CATALOG, DEMO_SHOP_NAME, type DemoSeedInput, type DemoSeedResult, seedDemoShop } from './demo-shop';

const USAGE = `Usage: npm run seed -- --phone <owner phone> [--phone-number-id <id>] [--display-phone <number>]

  --phone            Phone the owner logs in with, international format (+225...).
  --phone-number-id  "Phone number ID" of the WhatsApp number in Meta's dashboard
                     (WhatsApp > API Setup). Leave it out to skip the WhatsApp link.
  --display-phone    The WhatsApp number as people see it, e.g. "+1 555 0100".

Example:
  npm run seed -- --phone +2250700000000 --phone-number-id 123456789012345 --display-phone "+1 555 0100"`;

class UsageError extends Error {}

/** backend/.env, wherever the script is started from. */
function loadDotEnv(): void {
  const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
  try {
    process.loadEnvFile(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

function parseInput(argv: string[]): DemoSeedInput | 'help' {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        phone: { type: 'string' },
        'phone-number-id': { type: 'string' },
        'display-phone': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
  if (values.help) return 'help';

  if (!values.phone) throw new UsageError('--phone is required.');
  const phone = normalizePhone(values.phone);
  if (!phone) throw new UsageError(`--phone "${values.phone}" is not an international number like +2250700000000.`);

  const phoneNumberId = values['phone-number-id']?.trim();
  if (phoneNumberId !== undefined && !/^\d{5,30}$/.test(phoneNumberId)) {
    throw new UsageError(`--phone-number-id must be digits only (Meta's "Phone number ID"), got "${phoneNumberId}".`);
  }
  if (phoneNumberId === undefined && values['display-phone'] !== undefined) {
    throw new UsageError('--display-phone needs --phone-number-id.');
  }
  const displayPhone = values['display-phone']?.trim();
  if (displayPhone !== undefined && displayPhone.length > 30) {
    throw new UsageError('--display-phone is too long (30 characters max).');
  }
  return { phone, phoneNumberId, displayPhone };
}

/** The database URL without its password, for messages. */
function safeUrl(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '(DATABASE_URL)';
  }
}

/** Fixed login code for `phone` in AUTH_TEST_CODES, if any. */
function testCode(config: Config, phone: string): string | undefined {
  for (const [p, code] of config.authTestCodes) {
    if (normalizePhone(p) === phone) return code;
  }
  return undefined;
}

function report(input: DemoSeedInput, r: DemoSeedResult, config: Config): string {
  const lines: string[] = [];
  const c = r.catalog;
  lines.push('Demo shop ready.', '');
  lines.push(`  Owner      Awa, ${input.phone} (${r.owner === 'created' ? 'created' : 'already existed'})`);
  lines.push(`  Shop       ${DEMO_SHOP_NAME}, id ${r.shopId} (${r.shop}, demo profile written)`);
  lines.push(
    `  Catalogue  ${DEMO_CATALOG.length} demo items: ${c.created} created, ${c.updated} updated, ${c.unchanged} unchanged`,
  );
  if (r.channel) {
    const ch = r.channel;
    const shown = ch.displayPhone ? `, shown as ${ch.displayPhone}` : '';
    lines.push(`  WhatsApp   phone_number_id ${ch.phoneNumberId}${shown} (${ch.change === 'unchanged' ? 'already linked' : 'linked'})`);
    if (ch.movedFrom) {
      lines.push(`             Moved from the shop "${ch.movedFrom.shopName}" (id ${ch.movedFrom.shopId}).`);
    }
  } else {
    lines.push('  WhatsApp   not changed (no --phone-number-id)');
  }

  lines.push('', 'Next steps', '');
  const code = testCode(config, input.phone);
  lines.push('  1. Log in with this phone number (from the app, or with curl: backend/README.md, "Try it").');
  if (code) {
    lines.push(`     It is in AUTH_TEST_CODES: the code is always ${code}.`);
  } else {
    lines.push('     To log in with a fixed code, add the number to AUTH_TEST_CODES in backend/.env, e.g.');
    lines.push(`       AUTH_TEST_CODES=${input.phone}:123456`);
    lines.push('     then restart the API. Otherwise the code is printed in the API logs ("sms (console, not sent)").');
  }
  lines.push('  2. Start the API and the worker, in two terminals: npm run dev   and   npm run dev:worker');
  if (r.channel) {
    const to = r.channel.displayPhone || 'the test number';
    lines.push(`  3. From a phone added as a recipient in Meta's dashboard, send a WhatsApp message to ${to}`);
    lines.push('     and watch the worker logs. Guide: docs/guides/WHATSAPP_TEST_NUMBER.md');
  } else {
    lines.push('  3. Try the test chat in the app. To answer real WhatsApp messages, run the seed again with');
    lines.push('     --phone-number-id (see docs/guides/WHATSAPP_TEST_NUMBER.md).');
  }

  const warnings: string[] = [];
  if (r.channel) {
    if (!config.meta.accessToken) warnings.push('META_ACCESS_TOKEN is empty: the worker cannot send WhatsApp replies.');
    if (!config.meta.verifyToken) warnings.push('META_VERIFY_TOKEN is empty: Meta cannot verify the webhook URL.');
    if (!config.meta.appSecret) {
      warnings.push('META_APP_SECRET is empty: webhook signatures are not checked (fine for a quick local test only).');
    }
  }
  if (!config.anthropicApiKey) warnings.push('ANTHROPIC_API_KEY is empty: the offline keyword assistant will answer.');
  if (warnings.length) {
    lines.push('', 'Heads-up', '');
    for (const w of warnings) lines.push(`  - ${w}`);
  }
  return lines.join('\n');
}

/** Turns the usual first-run errors into a hint. */
function hint(err: unknown, databaseUrl: string): string {
  const e = err as { code?: string; message?: string };
  if (e.code === 'ECONNREFUSED' || e.code === 'ENOTFOUND') {
    return `Cannot reach Postgres at ${safeUrl(databaseUrl)}. Is it running? (docker compose up -d)`;
  }
  if (e.code === '42P01') return 'The tables do not exist yet. Run the migrations first: npm run migrate';
  if (e.code === '3D000') return `The database in DATABASE_URL does not exist: ${safeUrl(databaseUrl)}`;
  return e.message ?? String(err);
}

async function main(): Promise<number> {
  let input: DemoSeedInput | 'help';
  try {
    input = parseInput(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof UsageError)) throw err;
    console.error(`${err.message}\n\n${USAGE}`);
    return 2;
  }
  if (input === 'help') {
    console.log(USAGE);
    return 0;
  }

  loadDotEnv();
  let config: Config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  const db = createPool(config.databaseUrl);
  try {
    const result = await seedDemoShop(db, input, systemClock.now());
    console.log(report(input, result, config));
    return 0;
  } catch (err) {
    console.error(`Seed failed: ${hint(err, config.databaseUrl)}`);
    return 1;
  } finally {
    await db.end();
  }
}

process.exitCode = await main();
