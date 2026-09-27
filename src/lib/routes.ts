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

/** Recite a whole surah from memory (hidden text, peek per ayah, rating optional) */
export const reciteHref = (surahId: number) => `/recite?s=${surahId}`;
/** Listen to a whole surah while the text follows along */
export const listenHref = (surahId: number) => `/listen?s=${surahId}`;

const LEGACY_LESSON = /^\/lesson\/(\d+)\/(\d+)\/?(?:\?(.*))?$/;

/**
 * Rewrites a legacy /lesson/<s>/<l>[?from=…] URL to /learn, and drops trailing
 * slashes (a slashed path fetches `…/index.txt`, which the export doesn't have).
 * Anything else passes through.
 */
export function normalizeAppUrl(url: string): string {
  const m = LEGACY_LESSON.exec(url);
  if (m) {
    const from = m[3] ? new URLSearchParams(m[3]).get('from') : null;
    return lessonHref(Number(m[1]), Number(m[2]), from);
  }
  const q = url.indexOf('?');
  const path = q === -1 ? url : url.slice(0, q);
  const trimmed = path.length > 1 ? path.replace(/\/+$/, '') || '/' : path;
  return q === -1 ? trimmed : `${trimmed}${url.slice(q)}`;
}

const inRange = (v: string, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= max;
};

/**
 * Whether a pathname is a page the static export actually contains. The native
 * shells serve Home for ANY unknown path, and asking the router for a missing
 * page makes Next fall back to a full load — which lands on Home again, which
 * retries… an infinite reload loop. Only known routes are ever recovered.
 */
export function isAppRoute(pathname: string): boolean {
  if (['/', '/learn', '/recite', '/listen', '/review', '/review/session', '/progress', '/essentials', '/plan', '/plan/setup', '/plan/edit', '/auth/callback'].includes(pathname)) {
    return true;
  }
  let m: RegExpExecArray | null;
  if ((m = /^\/lesson\/(\d+)$/.exec(pathname))) return inRange(m[1], 114);
  if ((m = /^\/plan\/revise\/(\d+)$/.exec(pathname))) return inRange(m[1], 114);
  if ((m = /^\/juz\/(\d+)$/.exec(pathname))) return inRange(m[1], 30);
  return /^\/essentials\/[a-z0-9-]+$/.test(pathname);
}

/**
 * `from` params become in-app back links — accept only a relative app path like
 * "juz/5", never "/evil.com" (→ "//evil.com", a protocol-relative off-site link).
 */
export function safeFromPath(from: string | null): string | null {
  if (!from || !/^[a-z0-9][a-z0-9/_-]*$/i.test(from) || from.includes('//')) return null;
  return isAppRoute(`/${from}`) ? from : null;
}
