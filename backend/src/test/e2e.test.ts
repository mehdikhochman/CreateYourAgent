/**
 * The whole message flow through the real app, worker handlers, queue and
 * offline assistant — only WhatsApp, push and the clock are fakes:
 * Meta webhook → stored message → debounced reply job → assistant → WhatsApp
 * reply → alert + push → owner takes over → owner replies from the app.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../app';
import { conversationJobHandlers } from '../conversations/jobs';
import { createAssistant, KeywordDecider } from '../engine';
import { PgJobQueue } from '../jobs/queue';
import { processNextJob } from '../jobs/worker';
import { FIXTURE_CUSTOMER_WA_ID, FIXTURE_PHONE_NUMBER_ID, signMetaBody } from '../whatsapp/fixtures';
import { useTestDb } from './db';
import { makeTestDeps, type TestDeps } from './fakes';
import { type SeededOwner, seedChannel, seedDemoProfile, seedOwner } from './seed';

const testDb = useTestDb();
const PUSH_TOKEN = 'ExponentPushToken[e2e-test-device]';

let deps: TestDeps;
let owner: SeededOwner;
let app: ReturnType<typeof createApp>;
let wamidCounter = 0;

beforeEach(async () => {
  const base = makeTestDeps(testDb.db);
  deps = {
    ...base,
    // Real queue and real (offline) assistant; the type keeps the fakes' shape for the rest.
    jobs: new PgJobQueue(testDb.db, base.clock) as unknown as TestDeps['jobs'],
    assistant: createAssistant(new KeywordDecider()) as unknown as TestDeps['assistant'],
  };
  owner = await seedOwner(testDb.db, { pushToken: PUSH_TOKEN, now: deps.clock.now() });
  await seedDemoProfile(testDb.db, owner.shopId);
  await seedChannel(testDb.db, owner.shopId, FIXTURE_PHONE_NUMBER_ID);
  app = createApp(deps);
});

/** Posts a signed Meta webhook carrying one customer text message. */
async function customerWrites(text: string) {
  wamidCounter += 1;
  const raw = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba-1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550100', phone_number_id: FIXTURE_PHONE_NUMBER_ID },
              contacts: [{ profile: { name: 'Fatou' }, wa_id: FIXTURE_CUSTOMER_WA_ID }],
              messages: [
                {
                  from: FIXTURE_CUSTOMER_WA_ID,
                  id: `wamid.e2e.${wamidCounter}`,
                  timestamp: String(Math.floor(deps.clock.now().getTime() / 1000)),
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const res = await app.request('/webhooks/meta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-hub-signature-256': signMetaBody(raw, deps.config.meta.appSecret!),
    },
    body: raw,
  });
  expect(res.status).toBe(200);
}

/** Lets the debounce pass, then runs every job that is due, like the worker. */
async function runWorker() {
  deps.clock.advance((deps.config.replyDebounceSeconds + 1) * 1000);
  const handlers = conversationJobHandlers(deps);
  let ran = 0;
  while (await processNextJob(deps, handlers, 'e2e-worker')) ran += 1;
  return ran;
}

async function api(method: string, path: string, body?: unknown) {
  const res = await app.request(`/v1${path}`, {
    method,
    headers: { ...owner.headers, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

describe('end to end: a customer writes on WhatsApp', () => {
  it('gets a price built from the shop data, and the conversation shows in the app', async () => {
    await customerWrites('Bonsoir, le sac est à combien ?');
    expect(deps.whatsapp.sent).toHaveLength(0); // nothing before the debounce

    expect(await runWorker()).toBe(1);
    expect(deps.whatsapp.sent).toHaveLength(1);
    const reply = deps.whatsapp.sent[0]!;
    expect(reply).toMatchObject({ phoneNumberId: FIXTURE_PHONE_NUMBER_ID, to: FIXTURE_CUSTOMER_WA_ID });
    expect(reply.text).toContain('Sac à main simili cuir');
    expect(reply.text).toContain('8 500 F');

    const list = await api('GET', '/conversations');
    expect(list.status).toBe(200);
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.conversations[0]).toMatchObject({
      customer: { name: 'Fatou', phone: `+${FIXTURE_CUSTOMER_WA_ID}` },
      needsAttention: false,
      aiPausedUntil: null,
      canReply: true,
    });
    const id = list.body.conversations[0].id;
    const msgs = await api('GET', `/conversations/${id}/messages`);
    expect(msgs.body.messages.map((m: { role: string; status: string }) => [m.role, m.status])).toEqual([
      ['customer', 'received'],
      ['assistant', 'sent'],
    ]);
  });

  it('answers a burst of messages once', async () => {
    await customerWrites('Bonjour');
    deps.clock.advance(1000);
    await customerWrites('vous livrez à Yopougon ?');
    await runWorker();
    expect(deps.whatsapp.sent).toHaveLength(1);
    expect(deps.whatsapp.sent[0]!.text).toContain('Yopougon');
  });

  it('alerts the owner with a push when a customer wants to order', async () => {
    await customerWrites('je veux payer sac oh');
    await runWorker();

    expect(deps.whatsapp.sent).toHaveLength(1);
    expect(deps.push.sent).toHaveLength(1);
    expect(deps.push.sent[0]).toMatchObject({ to: PUSH_TOKEN, title: 'Commande' });

    const list = await api('GET', '/conversations?filter=attention');
    expect(list.body.conversations).toHaveLength(1);
    expect(list.body.alerts).toEqual([expect.objectContaining({ kind: 'order', status: 'open' })]);

    const done = await api('POST', `/alerts/${list.body.alerts[0].id}/done`);
    expect(done.status).toBe(200);
    expect(done.body.conversation.needsAttention).toBe(false);
  });

  it('stays silent after « Je prends la main », notifies the owner, and sends the owner’s reply', async () => {
    await customerWrites('Bonjour');
    await runWorker();
    const id = (await api('GET', '/conversations')).body.conversations[0].id;

    const takeover = await api('POST', `/conversations/${id}/takeover`);
    expect(takeover.status).toBe(200);
    expect(takeover.body.conversation.aiPausedUntil).not.toBeNull();

    await customerWrites('Vous pouvez me faire un prix ?');
    await runWorker();
    expect(deps.whatsapp.sent).toHaveLength(1); // only the first greeting
    expect(deps.push.sent.at(-1)).toMatchObject({ to: PUSH_TOKEN, body: expect.stringContaining('Nouveau message') });

    const clientId = crypto.randomUUID();
    const sent = await api('POST', `/conversations/${id}/messages`, { clientId, text: 'Je vous fais 8 000 F.' });
    expect(sent.status).toBe(201);
    await runWorker();
    expect(deps.whatsapp.sent).toHaveLength(2);
    expect(deps.whatsapp.sent[1]).toMatchObject({ to: FIXTURE_CUSTOMER_WA_ID, text: 'Je vous fais 8 000 F.' });

    // The app's outbox retries the same request: nothing is sent twice.
    expect((await api('POST', `/conversations/${id}/messages`, { clientId, text: 'Je vous fais 8 000 F.' })).status).toBe(
      200,
    );
    await runWorker();
    expect(deps.whatsapp.sent).toHaveLength(2);
  });

  it('syncs everything to the app from cursor 0', async () => {
    await customerWrites('je veux payer sac oh');
    await runWorker();
    const sync = await api('GET', '/sync?cursor=0');
    expect(sync.status).toBe(200);
    expect(sync.body.profile).toMatchObject({ name: 'Awa Fashion', whatsapp: { connected: true } });
    expect(sync.body.catalog).toHaveLength(2);
    expect(sync.body.conversations).toHaveLength(1);
    expect(sync.body.messages).toHaveLength(2);
    expect(sync.body.alerts).toHaveLength(1);
    const again = await api('GET', `/sync?cursor=${sync.body.cursor}`);
    expect(again.body).toMatchObject({ profile: null, catalog: [], messages: [], hasMore: false });
  });
});
