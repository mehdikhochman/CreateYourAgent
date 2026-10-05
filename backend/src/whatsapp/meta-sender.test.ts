import { describe, expect, it } from 'vitest';

import { SilentLogger } from '../test/fakes';
import { MetaApiError, MetaCloudSender } from './meta-sender';

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return new Response(text, { status, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

const OK_SEND = {
  messaging_product: 'whatsapp',
  contacts: [{ input: '2250748123390', wa_id: '2250748123390' }],
  messages: [{ id: 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABEYEkFCQ0RFRgA=' }],
};

const WINDOW_CLOSED = {
  error: {
    message: '(#131047) Re-engagement message',
    type: 'OAuthException',
    code: 131047,
    error_data: {
      messaging_product: 'whatsapp',
      details: 'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
    },
    fbtrace_id: 'AbCdEf',
  },
};

function sender(fetchImpl: (url: string, init: RequestInit) => Promise<Response>, log = new SilentLogger()) {
  return new MetaCloudSender({ accessToken: 'EAAG-token', graphVersion: 'v24.0', fetchImpl, log });
}

describe('MetaCloudSender.sendText', () => {
  it('posts a text message and returns its wamid', async () => {
    const { calls, fetchImpl } = fakeFetch(200, OK_SEND);
    const result = await sender(fetchImpl).sendText({
      phoneNumberId: '1234567890',
      to: '2250748123390',
      text: 'Sac à main : **8 500 F**.',
    });
    expect(result).toEqual({ wamid: 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABEYEkFCQ0RFRgA=' });

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe('https://graph.facebook.com/v24.0/1234567890/messages');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: 'Bearer EAAG-token', 'Content-Type': 'application/json' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '2250748123390',
      type: 'text',
      text: { body: 'Sac à main : *8 500 F*.', preview_url: false },
    });
  });

  it('maps Meta errors to MetaApiError', async () => {
    const { fetchImpl } = fakeFetch(400, WINDOW_CLOSED);
    const err = await sender(fetchImpl)
      .sendText({ phoneNumberId: '1', to: '2', text: 'x' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetaApiError);
    expect(err).toMatchObject({
      name: 'MetaApiError',
      httpStatus: 400,
      metaCode: 131047,
      message: '(#131047) Re-engagement message',
      details: expect.stringContaining('24 hours'),
    });
  });

  it('handles non-JSON error bodies and answers without an id', async () => {
    const bad = fakeFetch(502, '<html>Bad Gateway</html>');
    await expect(sender(bad.fetchImpl).sendText({ phoneNumberId: '1', to: '2', text: 'x' })).rejects.toMatchObject({
      httpStatus: 502,
      metaCode: null,
      message: 'HTTP 502',
    });
    const empty = fakeFetch(200, { messages: [] });
    await expect(sender(empty.fetchImpl).sendText({ phoneNumberId: '1', to: '2', text: 'x' })).rejects.toBeInstanceOf(
      MetaApiError,
    );
  });

  it('gives up after the timeout', async () => {
    const hanging = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      });
    const s = new MetaCloudSender({ accessToken: 't', graphVersion: 'v24.0', fetchImpl: hanging, timeoutMs: 20 });
    await expect(s.sendText({ phoneNumberId: '1', to: '2', text: 'x' })).rejects.toMatchObject({ name: 'TimeoutError' });
  });
});

describe('MetaCloudSender.markRead', () => {
  it('marks read with the typing indicator', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { success: true });
    await sender(fetchImpl).markRead({ phoneNumberId: '1234567890', wamid: 'wamid.IN', typing: true });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v24.0/1234567890/messages');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN',
      typing_indicator: { type: 'text' },
    });
  });

  it('marks read without the typing indicator', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { success: true });
    await sender(fetchImpl).markRead({ phoneNumberId: '1', wamid: 'wamid.IN', typing: false });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN',
    });
  });

  it('never throws (best effort) and logs the failure', async () => {
    const log = new SilentLogger();
    const { fetchImpl } = fakeFetch(400, { error: { message: 'Invalid parameter', code: 100 } });
    await expect(sender(fetchImpl, log).markRead({ phoneNumberId: '1', wamid: 'w', typing: true })).resolves.toBeUndefined();
    expect(log.lines).toEqual([
      { level: 'warn', msg: 'whatsapp: markRead failed', data: { error: 'Invalid parameter', metaCode: 100 } },
    ]);
  });
});
