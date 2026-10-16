// Offline Quran search (roadmap #04). Pure: the caller supplies the index
// (src/data/search-index.json, loaded lazily) and the page/juz metadata.
//
// Arabic matching ignores harakat, Quranic marks and tatweel, and treats the alef,
// ya, ta marbuta and hamza-seat variants as one letter, so "الصلاة" finds
// ٱلصَّلَوٰةَ's ayahs. The Tanzil text itself is never changed (its licence forbids
// it): normalisation runs over a copy at search time.

export interface SearchIndex {
  counts: number[]; // ayahs per surah
  arabic: string[]; // Tanzil Simple Clean, verbatim, one per ayah in mushaf order
  translation: string[];
}

export interface QuranMeta {
  page: [number, number][];
  juz: [number, number][];
}

export interface AyahHit {
  surah: number;
  ayah: number;
  field: 'arabic' | 'translation';
  /** The ayah's text as stored, and the matched [start, end) ranges within it */
  text: string;
  ranges: [number, number][];
}

export type Jump =
  | { kind: 'ayah'; surah: number; ayah: number }
  | { kind: 'page'; page: number; surah: number; ayah: number }
  | { kind: 'juz'; juz: number; surah: number; ayah: number };

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ‌‍]/;
const FOLD: Record<string, string> = {
  'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ٲ': 'ا', 'ٳ': 'ا',
  'ى': 'ي', 'ئ': 'ي', 'ی': 'ي',
  'ة': 'ه',
  'ؤ': 'و',
  'ک': 'ك',
};
const BASMALA = 'بسم الله الرحمن الرحيم ';

/**
 * Normalise for matching, keeping a map from each output character back to its
 * source index (so a match can be highlighted in the original text).
 */
export function normalizeArabic(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (MARKS.test(ch)) continue;
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      norm += ' ';
      map.push(i);
      lastSpace = true;
      continue;
    }
    norm += FOLD[ch] ?? ch;
    map.push(i);
    lastSpace = false;
  }
  return { norm: norm.trimEnd(), map };
}

export function normalizeLatin(text: string): { norm: string; map: number[] } {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    // Fold accents so "allah" finds "Allāh" and "kursi" finds "Kursī"
    const ch = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().charAt(0) || ' ';
    // ’ ' and similar fold away so "allahs" finds "Allah's"
    if (/[’'‘`ʿʾ]/.test(ch)) continue;
    norm += /[a-z0-9]/.test(ch) ? ch : ' ';
    map.push(i);
  }
  return { norm, map };
}

export const isArabicQuery = (q: string) => /[؀-ۿ]/.test(q);

/** Global (0-based) ayah index from surah/ayah, and back */
export function ayahIndex(counts: number[], surah: number, ayah: number): number {
  let i = 0;
  for (let s = 1; s < surah; s++) i += counts[s - 1];
  return i + ayah - 1;
}

/** "2:255", "2 255", "page 50", "p50", "juz 30", "para 30" → where to go */
export function parseJump(query: string, counts: number[], meta: QuranMeta): Jump | null {
  const q = query.trim().toLowerCase();
  let m = /^(\d{1,3})\s*[:.\s-]\s*(\d{1,3})$/.exec(q);
  if (m) {
    const surah = Number(m[1]);
    const ayah = Number(m[2]);
    if (surah >= 1 && surah <= 114 && ayah >= 1 && ayah <= counts[surah - 1]) return { kind: 'ayah', surah, ayah };
    return null;
  }
  m = /^(?:page|pg|p|صفحة)\s*(\d{1,3})$/.exec(q);
  if (m) {
    const page = Number(m[1]);
    if (page < 1 || page > meta.page.length) return null;
    const [surah, ayah] = meta.page[page - 1];
    return { kind: 'page', page, surah, ayah };
  }
  m = /^(?:juz|juzz|para|parah|j|جزء)\s*(\d{1,2})$/.exec(q);
  if (m) {
    const juz = Number(m[1]);
    if (juz < 1 || juz > meta.juz.length) return null;
    const [surah, ayah] = meta.juz[juz - 1];
    return { kind: 'juz', juz, surah, ayah };
  }
  return null;
}

/** The page an ayah falls on (1-based) */
export function pageOf(meta: QuranMeta, surah: number, ayah: number): number {
  let lo = 0;
  let hi = meta.page.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const [s, a] = meta.page[mid];
    if (s < surah || (s === surah && a <= ayah)) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

// Normalised copies are built once per index object
const cache = new WeakMap<SearchIndex, { arabic: string[]; translation: string[]; refs: [number, number][] }>();

function prepared(index: SearchIndex) {
  let p = cache.get(index);
  if (p) return p;
  const refs: [number, number][] = [];
  index.counts.forEach((n, s) => { for (let a = 1; a <= n; a++) refs.push([s + 1, a]); });
  p = {
    refs,
    arabic: index.arabic.map((t, i) => {
      // Tanzil prefixes every surah's first ayah (but 1 and 9) with the basmala
      const [s, a] = refs[i];
      const body = a === 1 && s !== 1 && s !== 9 && t.startsWith(BASMALA) ? ' '.repeat(BASMALA.length) + t.slice(BASMALA.length) : t;
      return normalizeArabic(body).norm;
    }),
    translation: index.translation.map((t) => normalizeLatin(t).norm),
  };
  cache.set(index, p);
  return p;
}

/**
 * Ayahs containing the query: Arabic queries match the Arabic as a phrase; other
 * queries match the translation, every word required, whole-phrase hits first.
 */
export function searchAyahs(index: SearchIndex, query: string, limit = 50): { hits: AyahHit[]; total: number } {
  const arabic = isArabicQuery(query);
  const q = (arabic ? normalizeArabic(query) : normalizeLatin(query)).norm.trim().replace(/\s+/g, ' ');
  if (q.length < (arabic ? 2 : 3)) return { hits: [], total: 0 };
  const p = prepared(index);
  const words = q.split(' ').filter(Boolean);
  const scored: { i: number; score: number }[] = [];

  const haystack = arabic ? p.arabic : p.translation;
  for (let i = 0; i < haystack.length; i++) {
    const h = arabic ? haystack[i] : ` ${haystack[i]} `;
    if (arabic) {
      const at = h.indexOf(q);
      if (at < 0) continue;
      // Whole-word hits rank above hits inside a longer word
      const whole = (at === 0 || h[at - 1] === ' ') && (at + q.length === h.length || h[at + q.length] === ' ');
      scored.push({ i, score: whole ? 2 : 1 });
    } else {
      if (!words.every((w) => h.includes(w))) continue;
      const phrase = h.includes(` ${q} `) ? 3 : h.includes(q) ? 2 : 1;
      scored.push({ i, score: phrase });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.i - b.i);

  const hits = scored.slice(0, limit).map(({ i }) => {
    const [surah, ayah] = p.refs[i];
    const text = arabic ? index.arabic[i] : index.translation[i];
    // The phrase where it occurs whole; otherwise each word
    const needles = arabic || p.translation[i].includes(q) ? [q] : words;
    return { surah, ayah, field: arabic ? 'arabic' as const : 'translation' as const, text, ranges: matchRanges(text, needles, arabic) };
  });
  return { hits, total: scored.length };
}

/** Source-text ranges of each occurrence of the (normalised) needles, merged */
export function matchRanges(text: string, needles: string[], arabic: boolean): [number, number][] {
  const { norm, map } = arabic ? normalizeArabic(text) : normalizeLatin(text);
  const out: [number, number][] = [];
  for (const n of needles) {
    if (!n) continue;
    let from = 0;
    for (;;) {
      const at = norm.indexOf(n, from);
      if (at < 0) break;
      const start = map[at];
      const endIdx = map[at + n.length - 1];
      // Extend over trailing marks (harakat) of the last matched letter
      let end = endIdx + 1;
      while (end < text.length && MARKS.test(text[end])) end++;
      out.push([start, end]);
      from = at + n.length;
    }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}
