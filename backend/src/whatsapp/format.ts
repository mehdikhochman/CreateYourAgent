/**
 * Our replies mark bold as **x** (like the app renders it); WhatsApp uses *x*.
 * Only bold spans that stay on one line are converted.
 */
export function toWhatsAppText(text: string): string {
  return text.replace(/\*\*([^\n]+?)\*\*/g, '*$1*');
}
