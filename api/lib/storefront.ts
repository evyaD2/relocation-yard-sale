/**
 * @file storefront.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 *
 * Server-side mirror of the storefront's public data sources (Google Sheets for
 * item rows, Google Drive for photos). Used by the social-preview endpoints so a
 * shared link advertises the *item's own* metadata and photo.
 *
 * This intentionally duplicates the resolution logic in src/api/items.ts because
 * that module is Vite/browser code (import.meta.env, client bundling) and cannot
 * be imported from a Node serverless function.
 */

const SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1PbC77GYCxuE5VnTWKoz-jSFy7maXl8ITrQqkz1FY4Hs/gviz/tq?tqx=out:json';

const GDRIVE_FOLDER_ID = '1WgVqUGgGc2uPwJYPFE7_84JRoZLbxg8h';
// VITE_-prefixed vars are present in this project's Vercel runtime (see api/lib/supabase.ts).
const GDRIVE_API_KEY = process.env.GDRIVE_API_KEY || process.env.VITE_GDRIVE_API_KEY || '';
// The storefront's Drive API key is HTTP-referer-restricted. A browser sends this
// header automatically; a serverless function must set it explicitly or the key is
// rejected with 403 "Requests from referer <empty> are blocked".
const GDRIVE_REFERER = process.env.GDRIVE_REFERER || 'https://edry-sale.com/';

// Cover photo is the bare `{id}` file; phones may save any of these formats.
const ITEM_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'avif'];

export interface ShareItem {
  title: string;
  price: number;
  description: string;
  /** Direct, redirect-free image URL suitable for OG/Twitter previews, or null. */
  imageUrl: string | null;
}

/** Strips the JSONP wrapper Google Sheets adds around the gviz response. */
function extractJSON(raw: string): any {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf(')');
  return JSON.parse(raw.slice(start, end));
}

const cellVal = (cell: any): any => cell?.v ?? null;

/**
 * Resolve the cover photo's Drive fileId for an item by the `{id}.{ext}` naming
 * convention, then return a direct googleusercontent URL. Unlike
 * `drive.google.com/thumbnail?id=…` (which 302-redirects and breaks WhatsApp
 * previews), the `lh3.googleusercontent.com/d/{id}` form streams the bytes with a
 * 200 and a real image content-type.
 */
async function resolveCoverImage(itemId: string): Promise<string | null> {
  if (!GDRIVE_API_KEY) {
    console.warn('[og] GDRIVE_API_KEY not set — cannot resolve item photo.');
    return null;
  }
  try {
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${GDRIVE_FOLDER_ID}' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name)');
    url.searchParams.set('pageSize', '1000');
    url.searchParams.set('key', GDRIVE_API_KEY);

    const res = await fetch(url.toString(), { headers: { Referer: GDRIVE_REFERER } });
    if (!res.ok) throw new Error(`Drive API: ${res.status}`);
    const data = (await res.json()) as { files: Array<{ id: string; name: string }> };
    const fileMap = new Map(data.files.map(f => [f.name.toLowerCase(), f.id]));

    for (const ext of ITEM_EXTENSIONS) {
      const fileId = fileMap.get(`${itemId}.${ext}`);
      if (fileId) return `https://lh3.googleusercontent.com/d/${fileId}=s1600`;
    }
    return null;
  } catch (err) {
    console.error('[og] Drive resolution failed:', err);
    return null;
  }
}

/**
 * Look up a single storefront item by its sheet id and return the fields needed
 * for a social preview. Returns null if the item can't be found.
 */
export async function getShareItem(itemId: string): Promise<ShareItem | null> {
  const res = await fetch(SHEET_URL);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const payload = extractJSON(await res.text());
  const cols: Array<{ label: string }> = payload.table.cols;
  const rows: any[] = payload.table.rows ?? [];
  const idx = Object.fromEntries(cols.map((c, i) => [c.label, i]));

  const row = rows.find(r => {
    const cells: any[] = r.c ?? [];
    return String(cellVal(cells[idx['id']]) ?? '') === itemId;
  });
  if (!row) return null;

  const cells: any[] = row.c ?? [];
  const get = (label: string) => cellVal(cells[idx[label]]);

  const title = get('title') as string | null;
  if (!title) return null;

  // Prefer a Drive cover photo (the storefront's primary source); fall back to the
  // first URL in the sheet's `images` column if Drive resolution yields nothing.
  let imageUrl = await resolveCoverImage(itemId);
  if (!imageUrl) {
    const sheetImages = ((get('images') as string | null) ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (sheetImages[0]) imageUrl = sheetImages[0];
  }

  return {
    title,
    price: Number(get('price') ?? 0),
    description: (get('description') as string | null) ?? '',
    imageUrl,
  };
}
