// The 1441H Madina page text from DigitalKhatt (digitalkhatt-js, MIT): 604 pages,
// each a list of its printed lines (15, except pages 1 and 2). Line kinds, the
// short lines' widths and the hamza tweak are ported from DigitalKhatt's
// qurantext.service.ts; the ayah mapping is ours, read off the text itself
// (surah titles and the numbered ayah markers).

export const enum LineKind {
  Text = 0,
  Sura = 1,
  Basmala = 2,
}

export const MUSHAF_DK_PAGES = 604;

/** Lines narrower than the full width, keyed page * 15 + line (both 1-based) — from the print */
const NARROW_LINES = new Map<number, number>([
  [255 * 15 + 2, 0.74],
  [528 * 15 + 9, 0.6],
  [534 * 15 + 6, 0.7],
  [545 * 15 + 6, 0.75],
  [586 * 15 + 1, 0.81],
  [593 * 15 + 2, 0.81],
  [594 * 15 + 5, 0.63],
  [600 * 15 + 10, 0.75],
  [602 * 15 + 5, 0.63],
  [602 * 15 + 11, 0.9],
  [602 * 15 + 15, 0.53],
  [603 * 15 + 10, 0.66],
  [603 * 15 + 15, 0.6],
  [604 * 15 + 4, 0.55],
  [604 * 15 + 9, 0.55],
  [604 * 15 + 14, 0.675],
  [604 * 15 + 15, 0.5],
]);
// Pages 1 and 2: the text narrows into the ornament, line by line
for (const page of [1, 2]) {
  const r = 0.95;
  const widths = [page === 1 ? 0.5 : 0.45, 0.7, 0.9, 1, 0.9, 0.7, 0.4];
  widths.forEach((w, i) => NARROW_LINES.set(page * 15 + 2 + i, r * w));
}

export function lineWidthRatio(page: number, line: number): number {
  return NARROW_LINES.get(page * 15 + line) ?? 1;
}

/**
 * DigitalKhatt's fix-up for a hamza or madda over alef/waw/yeh: a combining
 * grapheme joiner keeps the shaper from reordering it with the vowel, so a
 * stretch applied to the letter isn't also applied to its fatha.
 */
export function adjustText(text: string): string {
  return text
    .replaceAll('آ', 'ا͏ٓ')
    .replaceAll('أ', 'ا͏ٔ͏')
    .replaceAll('ؤ', 'و͏ٔ͏')
    .replaceAll('ئ', 'ي͏ٔ͏');
}

const SURA_WORD = 'سُورَةُ';
const BISM = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ';
// Compared in NFC: the data has shadda before fatha (as DigitalKhatt typed it),
// while an editor may store these literals in canonical order
const KIND_RE = new RegExp(`^(?<sura>${SURA_WORD} .*)|(?<bism>${BISM}|بِّسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ)$`.normalize('NFC'), 'u');

export function lineKind(line: string): LineKind {
  const m = KIND_RE.exec(line.normalize('NFC'));
  if (m?.groups?.sura) return LineKind.Sura;
  if (m?.groups?.bism) return LineKind.Basmala;
  return LineKind.Text;
}

const AYAH_MARK = '۝';
/** Arabic-Indic digits to a number ("١٢" → 12) */
export function arabicNumber(s: string): number {
  let n = 0;
  for (const ch of s) {
    const d = ch.charCodeAt(0) - 0x0660;
    if (d < 0 || d > 9) return NaN;
    n = n * 10 + d;
  }
  return n;
}

export interface WordRef {
  surah: number;
  ayah: number;
  /** 1-based word number within the ayah (0 for an ayah marker) */
  word: number;
  marker: boolean;
}

export interface PageIndexEntry {
  /** Surah and ayah of the first ayah that starts or continues on the page */
  first: [number, number];
  /** Per line: its kind, and per space-separated token the ayah it belongs to (text lines only) */
  lines: { kind: LineKind; words: WordRef[] }[];
}

/**
 * Walk all pages once and tie every token to its surah, ayah and word number.
 * Surah titles start a new surah; an ayah ends at its numbered marker.
 */
export function indexPages(pages: string[][]): PageIndexEntry[] {
  let surah = 0;
  let ayah = 1;
  let word = 0;
  const out: PageIndexEntry[] = [];
  for (const page of pages) {
    let first: [number, number] | null = null;
    const lines: PageIndexEntry['lines'] = [];
    for (const line of page) {
      const kind = lineKind(line);
      const words: WordRef[] = [];
      if (kind === LineKind.Sura) {
        surah++;
        ayah = 1;
        word = 0;
      } else if (kind === LineKind.Text) {
        // (Al-Fatiha's basmala is its ayah 1 and carries a marker, so it is a text line)
        for (const tok of line.split(' ')) {
          if (tok.startsWith(AYAH_MARK)) {
            const n = arabicNumber(tok.slice(1));
            words.push({ surah, ayah: n, word: 0, marker: true });
            first ??= [surah, n];
            ayah = n + 1;
            word = 0;
          } else {
            word++;
            words.push({ surah, ayah, word, marker: false });
            first ??= [surah, ayah];
          }
        }
      }
      lines.push({ kind, words });
    }
    out.push({ first: first ?? [surah, ayah], lines });
  }
  return out;
}
