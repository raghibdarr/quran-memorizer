// The one place lesson URLs are built (M11a).
//
// Lessons live at a single static page, /learn?s=<surah>&l=<lesson>, instead of
// /lesson/<surah>/<lesson>: pre-rendering 2,259 near-identical lesson shells made
// the static export 160 MB — too heavy to bundle inside the mobile app.
// Old-style URLs still exist in the wild (bookmarks, and lastActivity.url in
// synced stats), so they are normalized rather than broken.

export function lessonHref(surahId: number, lessonNumber: number, from?: string | null): string {
  const base = `/learn?s=${surahId}&l=${lessonNumber}`;
  return from ? `${base}&from=${encodeURIComponent(from)}` : base;
}

const LEGACY_LESSON = /^\/lesson\/(\d+)\/(\d+)\/?(?:\?(.*))?$/;

/** Rewrites a legacy /lesson/<s>/<l>[?from=…] URL to /learn; anything else passes through. */
export function normalizeAppUrl(url: string): string {
  const m = LEGACY_LESSON.exec(url);
  if (!m) return url;
  const from = m[3] ? new URLSearchParams(m[3]).get('from') : null;
  return lessonHref(Number(m[1]), Number(m[2]), from);
}
