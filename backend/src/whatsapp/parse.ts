/**
 * Turns a Meta WhatsApp Cloud API webhook body into a flat list of events.
 * Tolerant by design: unknown objects, fields and message types are skipped or
 * mapped to 'other', and it never throws.
 *
 * Payload reference: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

/** Matches messages.kind in the schema. */
export type MessageKind = 'text' | 'audio' | 'image' | 'video' | 'sticker' | 'document' | 'location' | 'other';

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

/** A message a customer sent to the shop's number. */
export type InboundMessage = {
  type: 'message';
  phoneNumberId: string;
  /** Customer's WhatsApp id (phone digits). */
  from: string;
  /** WhatsApp profile name, '' when Meta doesn't send it. */
  profileName: string;
  wamid: string;
  /** When the customer sent it; null if Meta's timestamp is missing or invalid. */
  timestamp: Date | null;
  kind: MessageKind;
  text: string;
};

/** A message the owner typed in the WhatsApp Business app (coexistence echo). */
export type InboundEcho = {
  type: 'echo';
  phoneNumberId: string;
  /** Customer's WhatsApp id. */
  to: string;
  wamid: string;
  timestamp: Date | null;
  kind: MessageKind;
  text: string;
};

/** Delivery status of a message the shop sent. */
export type InboundStatus = {
  type: 'status';
  phoneNumberId: string;
  wamid: string;
  status: DeliveryStatus;
  timestamp: Date | null;
  /** First error Meta reports for a failed message. */
  error?: { code: number | null; title: string; details: string };
};

export type InboundEvent = InboundMessage | InboundEcho | InboundStatus;

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : undefined;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/** Postgres text can't hold NUL characters: drop them so one odd message can't block a webhook. */
function str(v: unknown): string {
  if (typeof v === 'string') return v.includes('\u0000') ? v.replaceAll('\u0000', '') : v;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** Meta timestamps are unix seconds as strings. */
function unixSeconds(v: unknown): Date | null {
  const s = str(v);
  if (!/^\d{1,12}$/.test(s)) return null;
  return new Date(Number(s) * 1000);
}

/**
 * Kind and text of a message object (shared by messages and echoes).
 * Returns null for messages to skip entirely (reactions).
 */
function contentOf(m: Obj): { kind: MessageKind; text: string } | null {
  const type = str(m.type);
  const part = obj(m[type]);
  switch (type) {
    case 'text':
      return { kind: 'text', text: str(part?.body) };
    case 'button':
      return { kind: 'text', text: str(part?.text) };
    case 'interactive': {
      const title = str(obj(part?.button_reply)?.title) || str(obj(part?.list_reply)?.title);
      return title ? { kind: 'text', text: title } : { kind: 'other', text: '' };
    }
    case 'image':
    case 'video':
    case 'document':
      return { kind: type, text: str(part?.caption) };
    case 'audio':
    case 'voice':
      return { kind: 'audio', text: '' };
    case 'sticker':
      return { kind: 'sticker', text: '' };
    case 'location': {
      const text = [str(part?.name), str(part?.address)].filter((s) => s !== '').join(', ');
      return { kind: 'location', text };
    }
    case 'reaction':
      return null;
    default:
      return { kind: 'other', text: '' };
  }
}

function parseMessages(value: Obj, phoneNumberId: string, out: InboundEvent[]) {
  const names = new Map<string, string>();
  for (const c of arr(value.contacts)) {
    const contact = obj(c);
    const waId = str(contact?.wa_id);
    if (waId) names.set(waId, str(obj(contact?.profile)?.name).trim());
  }

  for (const raw of arr(value.messages)) {
    const m = obj(raw);
    if (!m) continue;
    const from = str(m.from);
    const wamid = str(m.id);
    if (!from || !wamid) continue;
    const content = contentOf(m);
    if (!content) continue;
    out.push({
      type: 'message',
      phoneNumberId,
      from,
      profileName: names.get(from) ?? '',
      wamid,
      timestamp: unixSeconds(m.timestamp),
      ...content,
    });
  }

  for (const raw of arr(value.statuses)) {
    const s = obj(raw);
    if (!s) continue;
    const wamid = str(s.id);
    const status = str(s.status);
    if (!wamid || !isDeliveryStatus(status)) continue;
    const event: InboundStatus = { type: 'status', phoneNumberId, wamid, status, timestamp: unixSeconds(s.timestamp) };
    const err = obj(arr(s.errors)[0]);
    if (err) {
      const code = typeof err.code === 'number' ? err.code : Number.parseInt(str(err.code), 10);
      event.error = {
        code: Number.isFinite(code) ? code : null,
        title: str(err.title) || str(err.message),
        details: str(obj(err.error_data)?.details),
      };
    }
    out.push(event);
  }
}

function parseEchoes(value: Obj, phoneNumberId: string, out: InboundEvent[]) {
  for (const raw of arr(value.message_echoes)) {
    const m = obj(raw);
    if (!m) continue;
    const to = str(m.to);
    const wamid = str(m.id);
    if (!to || !wamid) continue;
    const content = contentOf(m);
    if (!content) continue;
    out.push({ type: 'echo', phoneNumberId, to, wamid, timestamp: unixSeconds(m.timestamp), ...content });
  }
}

function isDeliveryStatus(s: string): s is DeliveryStatus {
  return s === 'sent' || s === 'delivered' || s === 'read' || s === 'failed';
}

export function parseMetaWebhook(body: unknown): InboundEvent[] {
  const out: InboundEvent[] = [];
  const root = obj(body);
  if (!root || root.object !== 'whatsapp_business_account') return out;

  for (const e of arr(root.entry)) {
    for (const c of arr(obj(e)?.changes)) {
      const change = obj(c);
      const value = obj(change?.value);
      if (!change || !value) continue;
      const phoneNumberId = str(obj(value.metadata)?.phone_number_id);
      if (!phoneNumberId) continue;
      if (change.field === 'messages') parseMessages(value, phoneNumberId, out);
      else if (change.field === 'smb_message_echoes') parseEchoes(value, phoneNumberId, out);
    }
  }
  return out;
}
