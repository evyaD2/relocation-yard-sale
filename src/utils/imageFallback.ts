/**
 * Shared image error handling for storefront images.
 *
 * Drive/CDN thumbnails occasionally fail to load (throttling, deleted files,
 * naming gaps). Rather than show the browser's broken-image icon to buyers,
 * we swap in a neutral inline placeholder. The handler is detached after firing
 * so a failing placeholder can never cause an infinite onError loop.
 */

// Neutral "no image" placeholder (oatmeal background + camera glyph), inlined as
// a data URI so it never triggers another network request.
export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect width='400' height='400' fill='%23F5F5F7'/%3E%3Cg fill='none' stroke='%236E6E73' stroke-width='8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='150' y='160' width='100' height='80' rx='10'/%3E%3Ccircle cx='200' cy='200' r='22'/%3E%3Cpath d='M170 160l10-16h40l10 16'/%3E%3C/g%3E%3C/svg%3E";

/** onError handler for <img> — replaces a failed image with the placeholder once. */
export function handleImageError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src === IMAGE_PLACEHOLDER) return; // already swapped — avoid loops
  img.onerror = null;
  img.src = IMAGE_PLACEHOLDER;
}
