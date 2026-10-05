import type { Logger, WhatsAppSender } from '../deps';
import { toWhatsAppText } from './format';

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/**
 * Error answered by the Graph API. `metaCode` is Meta's error code, e.g.
 * 131047 = more than 24 hours since the customer's last message (the window is
 * closed), 131026 = number not on WhatsApp, 130429 = rate limited.
 */
export class MetaApiError extends Error {
  override readonly name = 'MetaApiError';
  constructor(
    readonly httpStatus: number,
    readonly metaCode: number | null,
    message: string,
    /** Meta's error_data.details, when given. */
    readonly details: string = '',
  ) {
    super(message);
  }
}

export type MetaCloudSenderOptions = {
  accessToken: string;
  /** e.g. 'v24.0' */
  graphVersion: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  /** Where markRead failures are reported (it never throws). */
  log?: Logger;
};

/** Sends as the shop's number through Meta's WhatsApp Cloud API. */
export class MetaCloudSender implements WhatsAppSender {
  private readonly accessToken: string;
  private readonly graphVersion: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly log?: Logger;

  constructor({ accessToken, graphVersion, fetchImpl = fetch, timeoutMs = 10_000, log }: MetaCloudSenderOptions) {
    this.accessToken = accessToken;
    this.graphVersion = graphVersion;
    // Called unbound: some fetch implementations reject a foreign `this`.
    this.fetchImpl = (url, init) => fetchImpl(url, init);
    this.timeoutMs = timeoutMs;
    this.log = log;
  }

  async sendText({ phoneNumberId, to, text }: { phoneNumberId: string; to: string; text: string }) {
    const data = await this.post(phoneNumberId, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: toWhatsAppText(text), preview_url: false },
    });
    const wamid = (data as { messages?: { id?: unknown }[] } | null)?.messages?.[0]?.id;
    if (typeof wamid !== 'string' || wamid === '') {
      throw new MetaApiError(200, null, 'Meta answered without a message id');
    }
    return { wamid };
  }

  /** Best effort: failures are logged, never thrown, so they can't block a reply. */
  async markRead({ phoneNumberId, wamid, typing }: { phoneNumberId: string; wamid: string; typing: boolean }) {
    try {
      await this.post(phoneNumberId, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: wamid,
        typing_indicator: typing ? { type: 'text' } : undefined,
      });
    } catch (err) {
      this.log?.warn('whatsapp: markRead failed', {
        error: err instanceof Error ? err.message : String(err),
        metaCode: err instanceof MetaApiError ? err.metaCode : undefined,
      });
    }
  }

  private async post(phoneNumberId: string, body: Record<string, unknown>): Promise<unknown> {
    const url = `https://graph.facebook.com/${this.graphVersion}/${encodeURIComponent(phoneNumberId)}/messages`;
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Non-JSON body (proxy error page…): handled below.
    }
    if (!res.ok) throw toMetaError(res.status, data);
    return data;
  }
}

function toMetaError(httpStatus: number, data: unknown): MetaApiError {
  const error = (data as { error?: Record<string, unknown> } | null)?.error;
  const code = typeof error?.code === 'number' ? error.code : null;
  const message = typeof error?.message === 'string' && error.message ? error.message : `HTTP ${httpStatus}`;
  const details = (error?.error_data as { details?: unknown } | undefined)?.details;
  return new MetaApiError(httpStatus, code, message, typeof details === 'string' ? details : '');
}
