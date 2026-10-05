import { describe, expect, it } from 'vitest';

import { FIXTURE_OUTBOUND_WAMID, metaFixture } from './fixtures';
import { parseMetaWebhook } from './parse';

const base = { phoneNumberId: '1234567890' };
const at = (iso: string) => new Date(iso);

/** Wraps message objects in a 'messages' webhook. */
function withMessages(messages: unknown[], contacts: unknown[] = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'waba',
        changes: [
          {
            field: 'messages',
            value: { messaging_product: 'whatsapp', metadata: { phone_number_id: '1234567890' }, contacts, messages },
          },
        ],
      },
    ],
  };
}

describe('parseMetaWebhook on fixtures', () => {
  it('text', () => {
    expect(parseMetaWebhook(metaFixture('text').body)).toEqual([
      {
        type: 'message',
        ...base,
        from: '2250748123390',
        profileName: 'Fatou',
        wamid: 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABIYFjNFQjBDMUQ4RTk0QTY1NDdCMDlCAA==',
        timestamp: at('2026-10-05T09:59:58Z'),
        kind: 'text',
        text: 'Bonsoir, le sac est à combien ?',
      },
    ]);
  });

  it('burst of two messages, in order', () => {
    const events = parseMetaWebhook(metaFixture('burst').body);
    expect(events.map((e) => (e.type === 'message' ? e.text : null))).toEqual(['Bonjour', 'svp prix sac']);
    expect(new Set(events.map((e) => e.wamid)).size).toBe(2);
  });

  it('voice note → audio', () => {
    expect(parseMetaWebhook(metaFixture('audio').body)).toMatchObject([{ type: 'message', kind: 'audio', text: '' }]);
  });

  it('image with caption', () => {
    expect(parseMetaWebhook(metaFixture('image').body)).toMatchObject([
      { type: 'message', kind: 'image', text: 'Vous avez ça en rouge ?' },
    ]);
  });

  it('interactive button reply → text', () => {
    expect(parseMetaWebhook(metaFixture('interactive').body)).toMatchObject([
      { type: 'message', kind: 'text', text: 'Oui, je commande', profileName: 'Fatou' },
    ]);
  });

  it('skips reactions', () => {
    expect(parseMetaWebhook(metaFixture('reaction').body)).toEqual([]);
  });

  it('statuses sent / delivered / read', () => {
    for (const [name, status, ts] of [
      ['status-sent', 'sent', '2026-10-05T10:00:05Z'],
      ['status-delivered', 'delivered', '2026-10-05T10:00:06Z'],
      ['status-read', 'read', '2026-10-05T10:00:10Z'],
    ] as const) {
      expect(parseMetaWebhook(metaFixture(name).body)).toEqual([
        { type: 'status', ...base, wamid: FIXTURE_OUTBOUND_WAMID, status, timestamp: at(ts) },
      ]);
    }
  });

  it('failed status with its error', () => {
    expect(parseMetaWebhook(metaFixture('status-failed').body)).toEqual([
      {
        type: 'status',
        ...base,
        wamid: FIXTURE_OUTBOUND_WAMID,
        status: 'failed',
        timestamp: at('2026-10-05T10:00:06Z'),
        error: {
          code: 131047,
          title: 'Re-engagement message',
          details:
            'Message failed to send because more than 24 hours have passed since the customer last replied to this number.',
        },
      },
    ]);
  });

  it('echo of a message the owner typed in WhatsApp Business', () => {
    expect(parseMetaWebhook(metaFixture('echo').body)).toEqual([
      {
        type: 'echo',
        ...base,
        to: '2250748123390',
        wamid: 'wamid.HBgNMjI1MDc0ODEyMzM5MBUCABEYEkVDSE8wMDAwMDAwMDAwMDAwMQA=',
        timestamp: at('2026-10-05T10:00:05Z'),
        kind: 'text',
        text: "Oui ma sœur, il reste en rouge. Je vous l'envoie demain.",
      },
    ]);
  });

  it('ignores unrelated fields', () => {
    expect(parseMetaWebhook(metaFixture('unrelated').body)).toEqual([]);
  });
});

describe('parseMetaWebhook message kinds', () => {
  const msg = (type: string, part: unknown) => ({ from: '225', id: `wamid.${type}`, timestamp: '1791194398', type, [type]: part });

  it('maps every kind', () => {
    const events = parseMetaWebhook(
      withMessages([
        msg('button', { payload: 'OUI', text: 'Oui' }),
        msg('interactive', { type: 'list_reply', list_reply: { id: 'r', title: 'Robe wax' } }),
        msg('interactive', { type: 'nfm_reply', nfm_reply: {} }),
        msg('video', { caption: 'regardez', id: 'v' }),
        msg('document', { caption: '', filename: 'facture.pdf' }),
        msg('sticker', { id: 's', animated: false }),
        msg('location', { latitude: 5.35, longitude: -4.0, name: 'Boutique', address: 'Cocody Angré' }),
        msg('location', { latitude: 5.35, longitude: -4.0 }),
        msg('unsupported', {}),
        msg('contacts', [{ name: { formatted_name: 'Awa' } }]),
      ]),
    );
    expect(events.map((e) => (e.type === 'message' ? [e.kind, e.text] : null))).toEqual([
      ['text', 'Oui'],
      ['text', 'Robe wax'],
      ['other', ''],
      ['video', 'regardez'],
      ['document', ''],
      ['sticker', ''],
      ['location', 'Boutique, Cocody Angré'],
      ['location', ''],
      ['other', ''],
      ['other', ''],
    ]);
  });

  it('uses the contact name of the right sender', () => {
    const events = parseMetaWebhook(
      withMessages(
        [
          { from: '225111', id: 'w1', timestamp: '1', type: 'text', text: { body: 'a' } },
          { from: '225222', id: 'w2', timestamp: '1', type: 'text', text: { body: 'b' } },
        ],
        [{ wa_id: '225222', profile: { name: ' Koffi ' } }],
      ),
    );
    expect(events.map((e) => (e.type === 'message' ? e.profileName : null))).toEqual(['', 'Koffi']);
  });
});

describe('parseMetaWebhook tolerance', () => {
  it('never throws on junk', () => {
    for (const body of [
      null,
      undefined,
      'x',
      42,
      [],
      {},
      { object: 'page', entry: [] },
      { object: 'whatsapp_business_account' },
      { object: 'whatsapp_business_account', entry: 'nope' },
      { object: 'whatsapp_business_account', entry: [null, 1, { changes: [null, { field: 'messages' }] }] },
      { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{}] } }] }] },
      withMessages([null, 'x', { id: 'w' }, { from: '225' }, { from: '225', id: 'w', type: 'text', text: 'not an object' }]),
    ]) {
      expect(() => parseMetaWebhook(body)).not.toThrow();
    }
  });

  it('keeps messages with a missing or bad timestamp (timestamp null)', () => {
    const events = parseMetaWebhook(
      withMessages([
        { from: '225', id: 'w1', type: 'text', text: { body: 'a' } },
        { from: '225', id: 'w2', timestamp: 'demain', type: 'text', text: { body: 'b' } },
      ]),
    );
    expect(events.map((e) => e.timestamp)).toEqual([null, null]);
  });

  it('skips messages without sender or id, and unknown statuses', () => {
    const body = withMessages([{ id: 'w', type: 'text', text: { body: 'a' } }, { from: '225', type: 'text' }]);
    const value = body.entry[0]!.changes[0]!.value as Record<string, unknown>;
    value.statuses = [
      { id: 'w1', status: 'deleted', timestamp: '1' },
      { status: 'read', timestamp: '1' },
      { id: 'w2', status: 'read', timestamp: '1' },
    ];
    expect(parseMetaWebhook(body)).toEqual([
      { type: 'status', phoneNumberId: '1234567890', wamid: 'w2', status: 'read', timestamp: new Date(1000) },
    ]);
  });

  it('skips changes without a phone_number_id', () => {
    const body = withMessages([{ from: '225', id: 'w', timestamp: '1', type: 'text', text: { body: 'a' } }]);
    (body.entry[0]!.changes[0]!.value as Record<string, unknown>).metadata = {};
    expect(parseMetaWebhook(body)).toEqual([]);
  });
});
