import { WHATSAPP_NUMBER } from './config';

/**
 * Builds a wa.me URL with an optional prefilled message.
 * Opens in a new tab on desktop, WhatsApp app on mobile.
 */
export function buildWhatsAppUrl(message?: string): string {
  const base = `https://wa.me/${WHATSAPP_NUMBER}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
