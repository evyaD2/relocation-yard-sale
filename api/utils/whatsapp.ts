/**
 * @file whatsapp.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';
const from = process.env.TWILIO_WHATSAPP_FROM || '';
const to = process.env.TWILIO_WHATSAPP_TO || '';

const client = twilio(accountSid, authToken);

const ensureWhatsAppPrefix = (num: string) => 
  num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;

export async function sendWhatsAppMessage(body: string, toOverride?: string) {
  const targetTo = toOverride || to;
  const fromWithPrefix = ensureWhatsAppPrefix(from);
  const toWithPrefix = ensureWhatsAppPrefix(targetTo);

  if (!accountSid || !authToken || !from || !targetTo) {
    console.error('WhatsApp credentials missing. Message not sent:', body);
    return;
  }

  console.log(`Attempting to send WhatsApp from ${fromWithPrefix} to ${toWithPrefix}...`);

  try {
    const message = await client.messages.create({
      body,
      from: fromWithPrefix,
      to: toWithPrefix
    });
    console.log('WhatsApp message sent successfully:', message.sid);
    return message.sid;
  } catch (error) {
    console.error('Twilio Error:', error);
    throw error;
  }
}
