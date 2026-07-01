/**
 * @file whatsapp.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { CONTACT_NUMBERS } from '../config/contacts';
import type { ItemContact } from '../types';

/**
 * Generates a pre-filled WhatsApp deep link with Hebrew template
 */
export function generateWhatsAppLink(itemTitle: string, itemPrice: number, contact: ItemContact): string {
  const GIDONY_WHATSAPP_NUMBER = CONTACT_NUMBERS[contact];
  
  const rawText = `היי משפחת אדרי!\n\nאשמח לפרטים על *${itemTitle}* שראיתי שנמכר ב-₪${itemPrice}.\n\nהאם זה עדיין רלוונטי?`;
  
  // URL encode the message string for safe transmission
  const encodedText = encodeURIComponent(rawText);

  return `https://wa.me/${GIDONY_WHATSAPP_NUMBER}?text=${encodedText}`;
}

/**
 * Normalises an Israeli phone number into the digits-only, country-code form
 * wa.me expects (e.g. "052-322-4218" → "972523224218").
 */
export function normalizeIsraeliPhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('972')) return digits;                // already has country code
  if (digits.startsWith('0')) return `972${digits.slice(1)}`; // local 05x… → 9725x…
  if (digits.length === 9) return `972${digits}`;             // 5x… missing the leading 0
  return digits;                                              // fall back to as-typed
}

/** Formats a YYYY-MM-DD date as DD/MM/YYYY for display in Hebrew messages. */
function formatDateHe(date: string): string {
  const [y, m, d] = date.split('-');
  return d && m && y ? `${d}/${m}/${y}` : date;
}

/**
 * Builds a WhatsApp deep link to the *buyer* letting them know a reserved item
 * is ready for pickup. Message is in Hebrew and pre-fills the item + pickup date.
 */
export function generateBuyerPickupLink(
  buyerPhone: string,
  itemTitle: string,
  buyerName?: string | null,
  pickupDate?: string | null,
  balanceDue?: number | null,
): string {
  const number = normalizeIsraeliPhone(buyerPhone);
  const greeting = buyerName?.trim() ? `היי ${buyerName.trim()}! 👋` : 'היי! 👋';

  let rawText = `${greeting}\n\nהמוצר *${itemTitle}* ששמרת מוכן לאיסוף 🎉`;
  if (pickupDate) rawText += `\n\nסיכמנו על איסוף בסביבות ${formatDateHe(pickupDate)}.`;
  if (balanceDue != null && balanceDue > 0) rawText += `\n\nנותרה יתרה לתשלום באיסוף: ₪${balanceDue}.`;
  rawText += `\n\nמתי נוח לך להגיע לקחת אותו? אשמח לתאם 🙏`;

  return `https://wa.me/${number}?text=${encodeURIComponent(rawText)}`;
}
