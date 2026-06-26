/**
 * @file stats.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { supabase } from '../lib/supabase.js';

export interface AutomationStats {
  availableItems: any[];
  views24h: any[];
  shares24h: any[];
  priceHistories: any[];
  previousDigest: any | null;
  temporalTrends: { [itemId: string]: number[] };
}

export async function fetchNightlyStats(): Promise<AutomationStats> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twelveDaysAgo = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000);

  const [
    { data: items },
    { data: views },
    { data: shares },
    { data: digests },
    { data: prices },
    { data: allViewsLast12d }
  ] = await Promise.all([
    // 1. All available items
    supabase
      .from('yard_sale_items')
      .select('*')
      .eq('status', 'available'),
    
    // 2. Views in last 24h
    supabase
      .from('item_views')
      .select('item_id, platform, referrer')
      .gte('viewed_at', yesterday.toISOString()),
    
    // 3. Shares in last 24h
    supabase
      .from('item_shares')
      .select('item_id, channel')
      .gte('shared_at', yesterday.toISOString()),
    
    // 4. Last digest for memory
    supabase
      .from('daily_digests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1),

    // 5. Price history for comparison
    supabase
      .from('price_history')
      .select('*')
      .order('changed_at', { ascending: false })
      .limit(100),

    // 6. Trend data: All views in last 12d
    supabase
      .from('item_views')
      .select('item_id, viewed_at')
      .gte('viewed_at', twelveDaysAgo.toISOString())
  ]);

  // Aggregate 12-day trends
  const temporalTrends: { [itemId: string]: number[] } = {};
  if (items) {
    items.forEach(item => {
      temporalTrends[item.id] = new Array(12).fill(0);
    });
  }

  if (allViewsLast12d) {
    allViewsLast12d.forEach(view => {
      if (temporalTrends[view.item_id]) {
        const viewDate = new Date(view.viewed_at);
        const dayDiff = Math.floor((now.getTime() - viewDate.getTime()) / (24 * 60 * 60 * 1000));
        if (dayDiff >= 0 && dayDiff < 12) {
          // day0 is today, day11 is 11 days ago
          // Let's store reversed: index 0 is oldest, index 11 is today
          temporalTrends[view.item_id][11 - dayDiff]++;
        }
      }
    });
  }

  return {
    availableItems: items || [],
    views24h: views || [],
    shares24h: shares || [],
    previousDigest: digests && digests.length > 0 ? digests[0] : null,
    priceHistories: prices || [],
    temporalTrends
  };
}
