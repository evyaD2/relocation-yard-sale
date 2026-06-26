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
