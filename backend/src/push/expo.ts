/**
 * Push notifications through Expo's push service (→ APNs / FCM).
 * https://docs.expo.dev/push-notifications/sending-notifications/
 *
 * Failures are logged, never thrown: a push that doesn't go out must not fail
 * the reply or the request that triggered it.
 */
import type { Logger, PushMessage, PushSender } from '../deps';

export const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;
const TIMEOUT_MS = 10_000;
const TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isExpoPushToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export type ExpoPushSenderOptions = {
  /** Only needed when "enhanced push security" is on in the Expo project. */
  accessToken?: string;
  fetchImpl?: typeof fetch;
  log: Logger;
};

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

export class ExpoPushSender implements PushSender {
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly log: Logger;

  constructor(opts: ExpoPushSenderOptions) {
    this.accessToken = opts.accessToken;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.log = opts.log;
  }

  async send(messages: PushMessage[]): Promise<void> {
    const valid = messages.filter((m) => isExpoPushToken(m.to));
    if (valid.length < messages.length) {
      this.log.warn('push: dropped invalid Expo push tokens', { count: messages.length - valid.length });
    }
    for (let i = 0; i < valid.length; i += CHUNK_SIZE) {
      await this.sendChunk(valid.slice(i, i + CHUNK_SIZE));
    }
  }

  private async sendChunk(chunk: PushMessage[]): Promise<void> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
    };
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`;
    const body = chunk.map((m) => ({
      to: m.to,
      title: m.title,
      body: m.body,
      data: m.data ?? {},
      sound: 'default',
      priority: 'high',
    }));

    try {
      const res = await this.fetchImpl(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.log.error('push: Expo request failed', { status: res.status, body: text.slice(0, 500) });
        return;
      }
      const json = (await res.json()) as { data?: Ticket[]; errors?: unknown[] };
      if (json.errors?.length) this.log.error('push: Expo returned errors', { errors: json.errors });
      (json.data ?? []).forEach((ticket, i) => {
        if (ticket.status !== 'error') return;
        // DeviceNotRegistered: the app was uninstalled or the token changed.
        this.log.warn('push: Expo rejected a message', {
          to: chunk[i]?.to,
          error: ticket.details?.error,
          message: ticket.message,
        });
      });
    } catch (err) {
      this.log.error('push: Expo request failed', { error: err instanceof Error ? err.message : String(err) });
    }
  }
}
