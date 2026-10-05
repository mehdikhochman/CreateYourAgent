/**
 * Push notifications to the shop owner, and the short French labels they use.
 */
import type { AppDeps } from '../deps';
import { waIdToPhone } from '../domain/phone';

export type OwnerNotification = {
  title: string;
  body: string;
  data: Record<string, unknown>;
};

const MAX_BODY = 180;

/**
 * Pushes to every device where the shop's owner is logged in. Never throws (a
 * failed push must not fail a reply); returns how many devices were targeted.
 */
export async function notifyOwner(
  deps: Pick<AppDeps, 'db' | 'clock' | 'push' | 'log'>,
  shopId: string,
  n: OwnerNotification,
): Promise<number> {
  try {
    const res = await deps.db.query<{ push_token: string }>(
      `SELECT DISTINCT s.push_token
         FROM sessions s
         JOIN shops sh ON sh.owner_id = s.owner_id
        WHERE sh.id = $1 AND s.revoked_at IS NULL AND s.expires_at > $2 AND s.push_token IS NOT NULL`,
      [shopId, deps.clock.now()],
    );
    if (res.rows.length === 0) return 0;
    const body = excerpt(n.body, MAX_BODY);
    await deps.push.send(res.rows.map((r) => ({ to: r.push_token, title: n.title, body, data: n.data })));
    return res.rows.length;
  } catch (err) {
    deps.log.error('push: could not notify the owner', {
      shopId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

/** « Fatou », or her number when WhatsApp gave no name. */
export function customerLabel(name: string, waId: string): string {
  return name.trim() || waIdToPhone(waId);
}

const KIND_LABELS: Record<string, string> = {
  audio: 'note vocale',
  image: 'photo',
  video: 'vidéo',
  sticker: 'sticker',
  document: 'document',
  location: 'position',
};

/** « [note vocale] » for media without a caption; the text otherwise. */
export function messagePreview(m: { kind: string; text: string }): string {
  const text = m.text.trim();
  if (text) return text;
  return `[${KIND_LABELS[m.kind] ?? 'message'}]`;
}

/** Cuts `text` to `max` characters, ending with « … » when cut. */
export function excerpt(text: string, max: number): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}
