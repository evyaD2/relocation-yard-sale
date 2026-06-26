/**
 * @file daily-digest.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { fetchNightlyStats } from './utils/stats.js';
import { generateDailyDigest } from './utils/ai.js';
import { sendWhatsAppMessage } from './utils/whatsapp.js';
import { supabase } from './lib/supabase.js';

/**
 * GET /api/daily-digest
 * Triggered by Vercel Cron nightly at 08:00 Israel Time.
 * Also manually triggerable with CRON_SECRET.
 */
export default async function handler(req: any, res: any) {
  // 1. Authorization Check
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.error('Unauthorized cron trigger attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('--- Starting Daily Digest Generation ---');

    // 2. Fetch Stats
    const stats = await fetchNightlyStats();
    console.log(`Fetched stats for ${stats.availableItems.length} items`);

    // 3. Generate AI Content
    const digestContent = await generateDailyDigest(stats);
    console.log('AI Digest generated successfully');

    // 4. Log to Database for "Memory"
    const { error: logError } = await supabase
      .from('daily_digests')
      .insert([{
        summary: digestContent.summary,
        recommendations: digestContent.recommendations,
        stats_period_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        stats_period_end: new Date().toISOString()
      }]);

    if (logError) {
      console.warn('Logging error (digest still sending):', logError);
    }

    // 5. Send WhatsApp to all recipients
    const recipients = [
      process.env.TWILIO_WHATSAPP_TO,
      process.env.TWILIO_WHATSAPP_TO_2
    ].filter(Boolean) as string[];

    if (recipients.length === 0) {
      console.warn('No WhatsApp recipients configured.');
    } else {
      await Promise.all(recipients.map(async (to) => {
        try {
          await sendWhatsAppMessage(digestContent.whatsappMessage, to);
        } catch (err) {
          console.error(`Failed to send to ${to}:`, err);
        }
      }));
    }

    return res.status(200).json({
      success: true,
      summary: digestContent.summary,
      recipients: recipients.length
    });
  } catch (error: any) {
    console.error('General Automation Error:', error);
    return res.status(500).json({
      error: 'Failed to process daily digest',
      details: error.message
    });
  }
}
