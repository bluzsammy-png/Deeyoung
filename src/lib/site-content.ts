// DEEYOUNG PRO — site content overrides (shared definition surface).
// The owner edits these keys from the admin Content tab; public surfaces
// fall back to their built-in defaults when a key is absent. Keys are
// whitelisted so the API can never become a general-purpose write surface.
//
// TEXT keys: plain text; hero.headline uses \n for line breaks.
// IMAGE keys: data URLs only (data:image/(png|jpeg|webp);base64,...) —
// stored inline so content survives redeploys without object storage.

export const CONTENT_TEXT_KEYS = {
  "hero.headline": "Landing hero headline (one line per row; last line gets the gradient)",
  "hero.sub": "Landing hero paragraph",
  "campaign.headline": "Full-bleed campaign panel headline",
  announcement: "Site banner above the landing hero (empty = hidden)",
} as const;

export const CONTENT_IMAGE_KEYS = {
  "film.poster": "16:9 brand film card poster on the landing hero",
} as const;

export const CONTENT_KEYS = [...Object.keys(CONTENT_TEXT_KEYS), ...Object.keys(CONTENT_IMAGE_KEYS)] as const;

export type ContentKey = (typeof CONTENT_KEYS)[number];

export const TEXT_MAX_CHARS = 5_000;
export const IMAGE_MAX_BYTES = 600_000; // ~600KB base64 data URL per image

export function isImageKey(key: string): boolean {
  return key in CONTENT_IMAGE_KEYS;
}

/** Validate a content write. Returns an error string or null when valid. */
export function validateContentValue(key: string, value: string): string | null {
  if (!(CONTENT_KEYS as readonly string[]).includes(key)) return "Unknown content key";
  if (isImageKey(key)) {
    const ok = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value) || value === "";
    if (!ok) return "Image must be a data URL (png, jpeg or webp)";
    if (value.length > IMAGE_MAX_BYTES) return `Image too large (max ${Math.round(IMAGE_MAX_BYTES / 1000)}KB)`;
    return null;
  }
  if (value.length > TEXT_MAX_CHARS) return `Text too long (max ${TEXT_MAX_CHARS} chars)`;
  return null;
}
