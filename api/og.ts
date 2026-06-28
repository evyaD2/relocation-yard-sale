/**
 * @file og.ts
 * @author Dor Gidony
 * @copyright © 2026 Dor Gidony. All rights reserved.
 *
 * Dynamic Open Graph endpoint for social link previews (WhatsApp, Facebook,
 * Twitter/X, Telegram, …).
 *
 * Why this exists: the storefront is a client-rendered SPA served from a single
 * static index.html. Social crawlers do NOT execute JavaScript — they read the
 * <meta> tags from the raw HTML response. That means a static index.html can only
 * ever advertise one preview image. This function returns crawler-targeted HTML
 * with per-share OG tags:
 *   - /?item=<id>  → the item's own photo, title and price
 *   - everything else → the family photo (family.jpg)
 *
 * It is reached only for crawler user-agents via a rewrite rule in vercel.json,
 * so real visitors are never routed here. A <meta http-equiv="refresh"> is
 * included as a safety net so that any human who does land here is bounced to
 * the real page.
 */

import { supabase } from './lib/supabase.js';

const SITE_NAME = 'Edry Yard Sale';
const DEFAULT_TITLE = "The Edrys' Yard Sale 🏡";
const DEFAULT_DESCRIPTION =
  'מכירת חצר של משפחת אדרי — פריטים מיוחדים מהבית. הכל למכירה, בואו לבדוק!';

/** Escape a string for safe interpolation into an HTML attribute / text node. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function handler(req: any, res: any) {
  // Reconstruct the public base URL from the proxy headers so asset and canonical
  // links are absolute (scrapers ignore root-relative image paths).
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'edry-sale.com';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const base = `${proto}://${host}`;

  const requestUrl = new URL(req.url || '/', base);
  const itemId = requestUrl.searchParams.get('item');

  let title = DEFAULT_TITLE;
  let description = DEFAULT_DESCRIPTION;
  let image = `${base}/family.jpg`;
  let canonical = `${base}/`;
  // Known dimensions let crawlers render a large image card without re-fetching.
  // The family photo is a fixed local asset; item photos vary, so we drop the
  // hints for those rather than advertise wrong dimensions.
  let imageWidth: number | null = 1462;
  let imageHeight: number | null = 1948;

  if (itemId) {
    try {
      const { data } = await supabase
        .from('yard_sale_items')
        .select('title, price, images, description')
        .eq('id', itemId)
        .single();

      if (data) {
        title = `${data.title} — ₪${data.price}`;
        description = data.description || description;
        const firstImage = Array.isArray(data.images) ? data.images[0] : undefined;
        if (firstImage) {
          image = firstImage;
          imageWidth = null;
          imageHeight = null;
        }
        canonical = `${base}/?item=${encodeURIComponent(itemId)}`;
      }
    } catch (err) {
      // Fall back to the default (family) preview if the lookup fails — a broken
      // preview is worse than a generic one.
      console.error('OG item lookup failed:', err);
    }
  }

  const html = `<!doctype html>
<html lang="he">
<head>
<meta charset="UTF-8" />
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:image" content="${esc(image)}" />${
    imageWidth && imageHeight
      ? `\n<meta property="og:image:width" content="${imageWidth}" />\n<meta property="og:image:height" content="${imageHeight}" />`
      : ''
  }
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="${esc(SITE_NAME)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(image)}" />
<meta http-equiv="refresh" content="0; url=${esc(canonical)}" />
</head>
<body>
<a href="${esc(canonical)}">${esc(title)}</a>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Let the CDN cache previews briefly so repeated crawls don't hammer the DB.
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=600');
  res.status(200).send(html);
}
