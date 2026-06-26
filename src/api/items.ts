/**
 * @file items.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 */

import { supabase } from '../lib/supabase';
import type { YardSaleItem, ItemStatus, ItemContact } from '../types';

// ── Google Drive image source ──────────────────────────────────────────────────

const GDRIVE_FOLDER_ID = '1WgVqUGgGc2uPwJYPFE7_84JRoZLbxg8h';
const GDRIVE_API_KEY = import.meta.env.VITE_GDRIVE_API_KEY as string | undefined;
const ITEM_SUFFIXES = ['', '-b', '-c', '-d', '-e', '-f', '-g', '-h'];
const ITEM_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

type DriveFile = { id: string; name: string };
// In-memory cache so we only call the Drive API once per page load
let driveFileCache: Map<string, string> | null = null;

/** Fetches the Drive folder once and returns a lowercase-filename → fileId map. */
async function buildDriveFileMap(): Promise<Map<string, string>> {
  if (driveFileCache) return driveFileCache;
  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', `'${GDRIVE_FOLDER_ID}' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id,name)');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('key', GDRIVE_API_KEY!);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Drive API: ${res.status}`);
  const data = await res.json() as { files: DriveFile[] };
  driveFileCache = new Map(data.files.map(f => [f.name.toLowerCase(), f.id]));
  return driveFileCache;
}

export function invalidateDriveCache() {
  driveFileCache = null;
}

function driveUrl(fileId: string): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=s2000`;
}

/** Resolves an item's Drive images using the naming convention: id, id-b, id-c … */
function resolveItemDriveImages(itemId: string, fileMap: Map<string, string>): string[] {
  const images: string[] = [];
  for (const suffix of ITEM_SUFFIXES) {
    let fileId: string | undefined;
    for (const ext of ITEM_EXTENSIONS) {
      fileId = fileMap.get(`${itemId}${suffix}.${ext}`);
      if (fileId) break;
    }
    if (fileId) images.push(driveUrl(fileId));
    else break; // images must be consecutive — stop at first gap
  }
  return images;
}

// ── Google Sheets public data source ──────────────────────────────────────────

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1PbC77GYCxuE5VnTWKoz-jSFy7maXl8ITrQqkz1FY4Hs/gviz/tq?tqx=out:json';

/** Strips the JSONP wrapper Google Sheets adds around the response. */
function extractJSON(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf(')');
  return JSON.parse(raw.slice(start, end));
}

/** Safely reads a cell value — returns null if the cell or its value is absent. */
function cellVal(cell: any): any {
  return cell?.v ?? null;
}

/** Maps a single Sheets row to a YardSaleItem. Returns null for incomplete rows. */
function rowToItem(row: any, cols: Array<{ label: string }>): YardSaleItem | null {
  const cells: any[] = row.c ?? [];
  const idx = Object.fromEntries(cols.map((c, i) => [c.label, i]));

  const get = (label: string) => cellVal(cells[idx[label]]);

  const rawId = get('id');
  const title = get('title') as string | null;
  if (rawId == null || !title) return null;

  // images: single URL or comma-separated list
  const rawImages = (get('images') as string | null) ?? '';
  const images = rawImages
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  // contact: sheet may use "me"/"wife" (original) or "evya"/"hadas" (admin writes)
  const rawContact = (get('contact') as string | null) ?? '';
  const contact: ItemContact =
    rawContact === 'wife' || rawContact === 'hadas' ? 'hadas' : 'evya';

  // delivery_time: map departure/july-related values to 'departure', everything else to 'flexible'
  const rawDelivery = ((get('delivery_time') as string | null) ?? '').toLowerCase();
  const DEPARTURE_KEYWORDS = ['departure', 'july'];
  const delivery_time: 'flexible' | 'departure' =
    DEPARTURE_KEYWORDS.some(k => rawDelivery.includes(k)) ? 'departure' : 'flexible';

  // status: guard against unexpected values
  const rawStatus = (get('status') as string | null) ?? 'available';
  const VALID_STATUSES = new Set(['available', 'pending', 'sold']);
  const status: ItemStatus = VALID_STATUSES.has(rawStatus)
    ? (rawStatus as ItemStatus)
    : 'available';

  const dimensions = (get('dimensions') as string | null) || undefined;
  const fbMarketplaceLink = (get('fbMarketplaceLink') as string | null) || undefined;
  const rawOriginalPrice = get('original_price');
  const originalPrice = rawOriginalPrice != null && rawOriginalPrice !== '' ? Number(rawOriginalPrice) : undefined;
  const brand = (get('brand') as string | null) || undefined;
  const model = (get('model') as string | null) || undefined;
  const rawHidden = (get('hidden') as string | null) ?? '';
  const hidden = rawHidden === 'true' || rawHidden === '1';

  if (hidden) return null; // filtered out from public storefront

  return {
    id: String(rawId),
    title,
    description: (get('description') as string | null) ?? '',
    price: Number(get('price') ?? 0),
    condition: (get('condition') as string | null) ?? '',
    category: (get('category') as string | null) ?? '',
    status,
    images,
    dimensions,
    fbMarketplaceLink,
    contact,
    display_order: Number(get('display_order') ?? 0),
    delivery_time,
    originalPrice,
    brand,
    model,
    hidden: false, // already filtered above; admin panel sets this separately
  };
}

export async function fetchItems(): Promise<YardSaleItem[]> {
  try {
    const res = await fetch(SHEET_URL);
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

    const payload = extractJSON(await res.text());
    const cols: Array<{ label: string }> = payload.table.cols;
    const rows: any[] = payload.table.rows ?? [];

    const items = rows
      .map(row => rowToItem(row, cols))
      .filter((item): item is YardSaleItem => item !== null);

    // Fetch Drive folder file list once, then resolve images per item
    let driveImageArrays: string[][] = items.map(() => []);
    if (!GDRIVE_API_KEY) {
      console.warn('[Drive] VITE_GDRIVE_API_KEY is not set — restart the dev server after adding .env.local');
    } else {
      try {
        const fileMap = await buildDriveFileMap();
        console.info(`[Drive] Loaded ${fileMap.size} files from folder`);
        driveImageArrays = items.map(item => resolveItemDriveImages(item.id, fileMap));
      } catch (err) {
        console.error('[Drive] image fetch failed:', err);
      }
    }

    return items
      .map((item, i) => ({
        ...item,
        images: [...driveImageArrays[i], ...item.images],
      }))
      // Preserve the same descending display_order sort as the original Supabase query
      .sort((a, b) => (b.display_order ?? 0) - (a.display_order ?? 0));

  } catch (err) {
    console.error('Error fetching items from Google Sheets:', err);
    return [];
  }
}

export async function updateItemStatus(id: string, status: ItemStatus): Promise<boolean> {
  const { error } = await supabase
    .from('yard_sale_items')
    .update({ status })
    .eq('id', id);

  if (error) {
    console.error('Error updating item status:', error);
    return false;
  }
  return true;
}

export async function updateItemContact(id: string, contact: string): Promise<boolean> {
  const { error } = await supabase
    .from('yard_sale_items')
    .update({ contact })
    .eq('id', id);

  if (error) {
    console.error('Error updating item contact:', error);
    return false;
  }
  return true;
}

export async function createItem(item: Omit<YardSaleItem, 'id'>): Promise<YardSaleItem | null> {
  const { data, error } = await supabase
    .from('yard_sale_items')
    .insert([item])
    .select()
    .single();

  if (error) {
    console.error('Error creating item:', error);
    return null;
  }
  return data as YardSaleItem;
}

export async function updateItem(id: string, updates: Partial<YardSaleItem>): Promise<boolean> {
  const { error } = await supabase
    .from('yard_sale_items')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating item:', error);
    return false;
  }
  return true;
}

export async function deleteItem(item: YardSaleItem): Promise<boolean> {
  const { id, images } = item;

  // 1. Manually clean up item shares (since it currently lacks a database foreign key cascade)
  const { error: sharesError } = await supabase
    .from('item_shares')
    .delete()
    .eq('item_id', id);

  if (sharesError) {
    console.error('Error deleting item shares:', sharesError);
  }

  // 2. Manually clean up item views (in case the foreign key cascade is missing or misconfigured in the DB)
  const { error: viewsError } = await supabase
    .from('item_views')
    .delete()
    .eq('item_id', id);

  if (viewsError) {
    console.error('Error deleting item views:', viewsError);
  }

  // 3. Manually clean up price history
  const { error: historyError } = await supabase
    .from('price_history')
    .delete()
    .eq('item_id', id);

  if (historyError) {
    console.error('Error deleting price history:', historyError);
  }

  // 4. Delete the item from yard_sale_items
  const { error: dbError } = await supabase
    .from('yard_sale_items')
    .delete()
    .eq('id', id);

  if (dbError) {
    console.error('Error deleting item:', dbError);
    return false;
  }

  // 3. Delete files from Supabase Storage 'images' bucket
  if (images && images.length > 0) {
    const filePaths = images
      .map(url => {
        const bucketSegment = '/storage/v1/object/public/images/';
        const idx = url.indexOf(bucketSegment);
        return idx !== -1 ? url.substring(idx + bucketSegment.length) : null;
      })
      .filter((path): path is string => !!path);

    if (filePaths.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('images')
        .remove(filePaths);

      if (storageError) {
        console.error('Error deleting images from storage:', storageError);
      }
    }
  }

  return true;
}

export async function reorderItems(orderedItems: any[]): Promise<boolean> {
  // Strip out any nested joined tables (like item_categories) so PostgREST doesn't reject the payload
  const cleanedItems = orderedItems.map((item) => {
    const { item_categories, ...rest } = item;
    return rest;
  });

  const { error } = await supabase
    .from('yard_sale_items')
    .upsert(cleanedItems);

  if (error) {
    console.error('Error reordering items:', error);
    return false;
  }
  return true;
}

export async function uploadImage(file: File): Promise<string | null> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, file);

  if (uploadError) {
    console.error('Error uploading image:', uploadError);
    return null;
  }

  const { data } = supabase.storage
    .from('images')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

/**
 * Detects the viewer's platform based on screen width.
 */
function detectPlatform(): 'mobile' | 'tablet' | 'desktop' {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/**
 * Records an item view in the item_views table.
 * Must only be called when no user session is active (i.e. not the admin).
 */
export async function recordItemView(itemId: string, itemTitle: string): Promise<void> {
  const platform = detectPlatform();
  const referrer = document.referrer
    ? new URL(document.referrer).hostname
    : 'direct';

  const { error } = await supabase.from('item_views').insert([{
    item_id: itemId,
    item_title: itemTitle,
    platform,
    referrer,
  }]);

  if (error) {
    // Silently fail — analytics should never break the user experience
    console.warn('Analytics: failed to record view', error.message);
  }
}

// ── Analytics read functions (admin only) ──────────────────────────────────

export interface ItemViewStat {
  item_id: string;
  item_title: string;
  total_views: number;
  mobile_views: number;
  tablet_views: number;
  desktop_views: number;
}

/** Returns per-item view totals + platform breakdown for the last N days. */
export async function fetchItemViewStats(days = 12): Promise<ItemViewStat[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('item_views')
    .select('item_id, item_title, platform')
    .gte('viewed_at', since.toISOString());

  if (error) {
    console.error('Analytics: failed to fetch view stats', error);
    return [];
  }

  // Aggregate client-side
  const map = new Map<string, ItemViewStat>();
  for (const row of data as { item_id: string; item_title: string; platform: string }[]) {
    if (!map.has(row.item_id)) {
      map.set(row.item_id, {
        item_id: row.item_id,
        item_title: row.item_title,
        total_views: 0,
        mobile_views: 0,
        tablet_views: 0,
        desktop_views: 0,
      });
    }
    const stat = map.get(row.item_id)!;
    stat.total_views += 1;
    if (row.platform === 'mobile') stat.mobile_views += 1;
    else if (row.platform === 'tablet') stat.tablet_views += 1;
    else stat.desktop_views += 1;
  }

  return Array.from(map.values()).sort((a, b) => b.total_views - a.total_views);
}

export interface DailyViewStat {
  date: string; // YYYY-MM-DD in the browser's local timezone
  views: number;
}

/**
 * Returns YYYY-MM-DD in the **browser's local timezone**.
 * Simply slicing .toISOString() gives the UTC date, which is wrong
 * for users whose midnight falls on a different UTC day (e.g. UTC+3 after 21:00).
 */
function toLocalDateStr(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Returns daily view totals for the past N days (dates in local timezone). */
export async function fetchDailyViewStats(days = 12): Promise<DailyViewStat[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('item_views')
    .select('viewed_at')
    .gte('viewed_at', since.toISOString());

  if (error) {
    console.error('Analytics: failed to fetch daily stats', error);
    return [];
  }

  const map = new Map<string, number>();
  for (const row of data as { viewed_at: string }[]) {
    const date = toLocalDateStr(new Date(row.viewed_at)); // local date, not UTC
    map.set(date, (map.get(date) ?? 0) + 1);
  }

  // Fill in missing dates with 0 (use local dates for the range keys)
  const result: DailyViewStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = toLocalDateStr(d); // local date
    result.push({ date: dateStr, views: map.get(dateStr) ?? 0 });
  }

  return result;
}

// ── Storefront Visit Tracking ──────────────────────────────────────────────

/** Records a storefront visit. Must only be called when no session is active. */
export async function recordStorefrontVisit(): Promise<void> {
  const platform = detectPlatform();
  const referrer = document.referrer
    ? new URL(document.referrer).hostname
    : 'direct';

  const { error } = await supabase.from('storefront_visits').insert([{ platform, referrer }]);
  if (error) {
    console.warn('Analytics: failed to record storefront visit', error.message);
  }
}

export interface StorefrontStats {
  total: number;
  last12Days: number;
}

/** Returns total storefront visits (all-time) and for the last 12 days. */
export async function fetchStorefrontStats(): Promise<StorefrontStats> {
  const since = new Date();
  since.setDate(since.getDate() - 12);

  const [totalRes, last12Res] = await Promise.all([
    supabase.from('storefront_visits').select('id', { count: 'exact', head: true }),
    supabase
      .from('storefront_visits')
      .select('id', { count: 'exact', head: true })
      .gte('visited_at', since.toISOString()),
  ]);

  return {
    total: totalRes.count ?? 0,
    last12Days: last12Res.count ?? 0,
  };
}

// ── Per-item daily chart data ──────────────────────────────────────────────

export interface ItemDailyStat {
  item_id: string;
  item_title: string;
  date: string; // YYYY-MM-DD
  views: number;
}

/**
 * Returns per-item view counts for each day in the last N days.
 * Dates are in the browser's local timezone.
 * Only includes items with at least 1 view in that period.
 */
export async function fetchItemDailyStats(days = 12): Promise<ItemDailyStat[]> {
  const since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from('item_views')
    .select('item_id, item_title, viewed_at')
    .gte('viewed_at', since.toISOString());

  if (error) {
    console.error('Analytics: failed to fetch item daily stats', error);
    return [];
  }

  // Build date list using local dates
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(toLocalDateStr(d)); // local date
  }

  // Group by item then local date
  const byItem = new Map<string, { title: string; byDate: Map<string, number> }>();
  for (const row of data as { item_id: string; item_title: string; viewed_at: string }[]) {
    const date = toLocalDateStr(new Date(row.viewed_at)); // local date, not UTC
    if (!byItem.has(row.item_id)) {
      byItem.set(row.item_id, { title: row.item_title, byDate: new Map() });
    }
    const entry = byItem.get(row.item_id)!;
    entry.byDate.set(date, (entry.byDate.get(date) ?? 0) + 1);
  }

  // Flatten to ItemDailyStat[], filling 0s for missing dates
  const result: ItemDailyStat[] = [];
  for (const [item_id, { title, byDate }] of byItem) {
    for (const date of dates) {
      result.push({ item_id, item_title: title, date, views: byDate.get(date) ?? 0 });
    }
  }
  return result;
}

// ── Share Tracking ─────────────────────────────────────────────────────────

export type ShareChannel = 'whatsapp' | 'facebook' | 'native' | 'clipboard';

/** Records an item share. Must only be called when no admin session is active. */
export async function recordItemShare(
  itemId: string,
  itemTitle: string,
  channel: ShareChannel = 'whatsapp',
): Promise<void> {
  const { error } = await supabase.from('item_shares').insert([{
    item_id: itemId,
    item_title: itemTitle,
    channel,
    platform: detectPlatform(),
  }]);
  if (error) {
    console.warn('Analytics: failed to record item share', error.message);
  }
}

export interface ItemShareStat {
  item_id: string;
  item_title: string;
  total_shares: number;
}

/** Returns per-item share totals for the last N days. */
export async function fetchItemShareStats(days = 12): Promise<ItemShareStat[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('item_shares')
    .select('item_id, item_title')
    .gte('shared_at', since.toISOString());

  if (error) {
    console.error('Analytics: failed to fetch share stats', error);
    return [];
  }

  const map = new Map<string, ItemShareStat>();
  for (const row of data as { item_id: string; item_title: string }[]) {
    if (!map.has(row.item_id)) {
      map.set(row.item_id, { item_id: row.item_id, item_title: row.item_title, total_shares: 0 });
    }
    map.get(row.item_id)!.total_shares += 1;
  }

  return Array.from(map.values()).sort((a, b) => b.total_shares - a.total_shares);
}

/** Returns total share counts: all-time and last 12 days. */
export async function fetchTotalShares(): Promise<{ total: number; last12Days: number }> {
  const since = new Date();
  since.setDate(since.getDate() - 12);

  const [totalRes, last12Res] = await Promise.all([
    supabase.from('item_shares').select('id', { count: 'exact', head: true }),
    supabase.from('item_shares').select('id', { count: 'exact', head: true }).gte('shared_at', since.toISOString()),
  ]);

  return { total: totalRes.count ?? 0, last12Days: last12Res.count ?? 0 };
}
