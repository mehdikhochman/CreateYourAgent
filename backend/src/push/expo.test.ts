import { describe, expect, it } from 'vitest';

import type { PushMessage } from '../deps';
import { SilentLogger } from '../test/fakes';
import { EXPO_PUSH_URL, ExpoPushSender, isExpoPushToken } from './expo';

type Call = { url: string; init: RequestInit; body: Record<string, unknown>[] };

function fakeFetch(respond: (body: Record<string, unknown>[]) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>[];
    calls.push({ url: String(url), init: init ?? {}, body });
    return respond(body);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const okTickets = (body: unknown[]) =>
  Response.json({ data: body.map((_, i) => ({ status: 'ok', id: `ticket-${i}` })) });

const msg = (to: string, extra: Partial<PushMessage> = {}): PushMessage => ({
  to,
  title: 'Commande',
  body: 'Fatou — Veut commander : Sac cuir',
  ...extra,
});

describe('isExpoPushToken', () => {
  it('accepts both Expo token formats only', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc-123_x]')).toBe(true);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
    expect(isExpoPushToken('fcm:abcdef')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[abc] extra')).toBe(false);
  });
});

describe('ExpoPushSender', () => {
  it('posts the messages as a JSON array with the expected fields and headers', async () => {
    const { calls, fetchImpl } = fakeFetch(okTickets);
    const log = new SilentLogger();
    const sender = new ExpoPushSender({ fetchImpl, log });
    await sender.send([msg('ExponentPushToken[a]', { data: { conversationId: 'c1', type: 'alert' } })]);

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe(EXPO_PUSH_URL);
    expect(call.init.method).toBe('POST');
    expect(call.init.headers).toEqual({ accept: 'application/json', 'content-type': 'application/json' });
    expect(call.body).toEqual([
      {
        to: 'ExponentPushToken[a]',
        title: 'Commande',
        body: 'Fatou — Veut commander : Sac cuir',
        data: { conversationId: 'c1', type: 'alert' },
        sound: 'default',
        priority: 'high',
      },
    ]);
    expect(log.lines).toEqual([]);
  });

  it('sends the access token when one is set', async () => {
    const { calls, fetchImpl } = fakeFetch(okTickets);
    const sender = new ExpoPushSender({ accessToken: 'secret', fetchImpl, log: new SilentLogger() });
    await sender.send([msg('ExpoPushToken[a]')]);
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer secret' });
  });

  it('sends chunks of 100', async () => {
    const { calls, fetchImpl } = fakeFetch(okTickets);
    const sender = new ExpoPushSender({ fetchImpl, log: new SilentLogger() });
    await sender.send(Array.from({ length: 250 }, (_, i) => msg(`ExponentPushToken[t${i}]`)));
    expect(calls.map((c) => c.body.length)).toEqual([100, 100, 50]);
    expect(calls[2]!.body[49]!.to).toBe('ExponentPushToken[t249]');
  });

  it('drops invalid tokens, and sends nothing when none is left', async () => {
    const { calls, fetchImpl } = fakeFetch(okTickets);
    const log = new SilentLogger();
    const sender = new ExpoPushSender({ fetchImpl, log });
    await sender.send([msg('not-a-token'), msg('ExponentPushToken[ok]')]);
    expect(calls[0]!.body.map((m) => m.to)).toEqual(['ExponentPushToken[ok]']);
    expect(log.lines).toContainEqual(expect.objectContaining({ level: 'warn', data: { count: 1 } }));

    await sender.send([msg('nope')]);
    await sender.send([]);
    expect(calls).toHaveLength(1);
  });

  it('logs HTTP errors without throwing, and goes on with the next chunk', async () => {
    let n = 0;
    const { calls, fetchImpl } = fakeFetch((body) => {
      n += 1;
      return n === 1 ? new Response('upstream down', { status: 502 }) : okTickets(body);
    });
    const log = new SilentLogger();
    const sender = new ExpoPushSender({ fetchImpl, log });
    await expect(
      sender.send(Array.from({ length: 101 }, (_, i) => msg(`ExponentPushToken[t${i}]`))),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(log.lines).toContainEqual(
      expect.objectContaining({ level: 'error', data: { status: 502, body: 'upstream down' } }),
    );
  });

  it('logs ticket errors and network errors without throwing', async () => {
    const { fetchImpl } = fakeFetch(() =>
      Response.json({
        data: [
          { status: 'ok', id: 't1' },
          { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } },
        ],
      }),
    );
    const log = new SilentLogger();
    await new ExpoPushSender({ fetchImpl, log }).send([msg('ExponentPushToken[a]'), msg('ExponentPushToken[b]')]);
    expect(log.lines).toEqual([
      expect.objectContaining({
        level: 'warn',
        data: { to: 'ExponentPushToken[b]', error: 'DeviceNotRegistered', message: 'not registered' },
      }),
    ]);

    const failing = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    const log2 = new SilentLogger();
    await expect(
      new ExpoPushSender({ fetchImpl: failing, log: log2 }).send([msg('ExponentPushToken[a]')]),
    ).resolves.toBeUndefined();
    expect(log2.lines).toEqual([expect.objectContaining({ level: 'error', data: { error: 'fetch failed' } })]);
  });
});
