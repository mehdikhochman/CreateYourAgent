/**
 * Turns a WhatsApp send error into the text stored in messages.error.
 * Detected by duck typing (`err.metaCode`, set by the WhatsApp adapter's
 * MetaApiError) so this module doesn't depend on the adapter.
 */

/** Meta errors that retrying can't fix. */
const PERMANENT_META_ERRORS: Record<number, string> = {
  131047: 'Plus de 24 h : le client doit réécrire',
  131030: 'Numéro non autorisé : ajoutez-le aux destinataires du numéro de test Meta',
};

export type SendFailure = { permanent: boolean; message: string };

export function describeSendError(err: unknown): SendFailure {
  const code = typeof err === 'object' && err !== null ? (err as { metaCode?: unknown }).metaCode : undefined;
  const known = typeof code === 'number' ? PERMANENT_META_ERRORS[code] : undefined;
  if (known) return { permanent: true, message: known };
  const text = err instanceof Error ? err.message : String(err);
  return { permanent: false, message: text.slice(0, 500) || 'Erreur inconnue' };
}
