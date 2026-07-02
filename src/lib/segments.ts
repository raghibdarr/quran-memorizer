import type { Ayah, Word } from '@/types/quran';

// === Waqf-based ayah segmentation ===
//
// Long ayahs are split into recitation segments ONLY at the mushaf's printed pause
// marks (the scholarly curation of safe stops). Where no usable mark exists we keep
// the stretch whole — a blind word-count split risks a waqf qabih (meaning-distorting
// stop), so we never invent boundaries. Design + research log:
// .claude/plans/ayah-segmentation-waqf.md
//
// Mark treatment (chars as they appear inside word textUthmani):
//   U+06DA ۚ jeem (ja'iz)      stop/continue equal      → primary boundary
//   U+06D7 ۗ qaf-lam (qala)    stop preferred            → primary boundary
//   U+06D8 ۘ meem (lazim)      compulsory stop           → primary boundary
//   U+06D6 ۖ sad-lam (sala)    continue preferred        → secondary (only to break
//                                                          an over-long segment)
//   U+06DB ۛ mu'anaqah pair    stop at ONE of the two    → first of each pair only
//   U+06D9 ۙ lam-alif (la)     forbidden stop            → never a boundary
//   U+06DC ۜ seen (sakta)      breathless micro-pause    → never a boundary

const PRIMARY = ['ۚ', 'ۗ', 'ۘ'];
const SECONDARY = 'ۖ';
const MUANAQAH = 'ۛ';
const FORBIDDEN = 'ۙ';

/** Only segment ayahs longer than this many words; also the target max segment size. */
export const SEGMENT_THRESHOLD = 30;

export interface AyahSegment {
  /** 0-based segment index within the ayah */
  index: number;
  /** total segments in the ayah */
  count: number;
  /** inclusive range into the ayah's real words (charType === 'word') */
  wordStart: number;
  wordEnd: number;
  /** pause mark char that ends this segment (null = verse end) */
  endMark: string | null;
}

/** The ayah's real words (end-of-verse number markers stripped). */
export function realWords(ayah: Ayah): Word[] {
  return ayah.words.filter((w) => w.charType === 'word');
}

type Boundary = { kind: 'primary' | 'secondary'; mark: string };

/** Classify the pause mark a word carries, honouring lā (never) and mu'anaqah pairing. */
function boundaryAt(text: string, muanaqah: { seen: number }): Boundary | null {
  if (text.includes(FORBIDDEN)) return null;
  if (text.includes(MUANAQAH)) {
    muanaqah.seen += 1;
    // Stop at one of the pair, not both — take the first of each pair.
    return muanaqah.seen % 2 === 1 ? { kind: 'primary', mark: MUANAQAH } : null;
  }
  for (const mark of PRIMARY) {
    if (text.includes(mark)) return { kind: 'primary', mark };
  }
  if (text.includes(SECONDARY)) return { kind: 'secondary', mark: SECONDARY };
  return null;
}

/**
 * Segment an ayah at its printed pause marks. Returns a single whole-ayah segment
 * for anything at or under `threshold` words (the common case) or with no usable
 * marks — never invents a boundary.
 */
export function segmentAyah(ayah: Ayah, threshold: number = SEGMENT_THRESHOLD): AyahSegment[] {
  const words = realWords(ayah);
  const whole: AyahSegment[] = [
    { index: 0, count: 1, wordStart: 0, wordEnd: words.length - 1, endMark: null },
  ];
  if (words.length <= threshold) return whole;

  // Classify every word once (mu'anaqah pairing is ayah-wide).
  const muanaqah = { seen: 0 };
  const bounds: (Boundary | null)[] = words.map((w) => boundaryAt(w.textUthmani, muanaqah));

  // Pass 1: split after every primary mark (a mark on the final word is just the end).
  let ranges: Array<[number, number]> = [];
  let start = 0;
  for (let i = 0; i < words.length - 1; i++) {
    if (bounds[i]?.kind === 'primary') {
      ranges.push([start, i]);
      start = i + 1;
    }
  }
  ranges.push([start, words.length - 1]);

  // Pass 2: any still-over-long range may additionally break at its internal
  // ۖ (continue-preferred — still a permissible stop) marks.
  ranges = ranges.flatMap(([s, e]) => {
    if (e - s + 1 <= threshold) return [[s, e] as [number, number]];
    const out: Array<[number, number]> = [];
    let s2 = s;
    for (let i = s; i < e; i++) {
      if (bounds[i]?.kind === 'secondary') {
        out.push([s2, i]);
        s2 = i + 1;
      }
    }
    out.push([s2, e]);
    return out; // still over-long with no marks inside → stays whole (tier 2)
  });

  if (ranges.length <= 1) return whole;
  return ranges.map(([s, e], i) => ({
    index: i,
    count: ranges.length,
    wordStart: s,
    wordEnd: e,
    endMark: e < words.length - 1 ? bounds[e]?.mark ?? null : null,
  }));
}

// === Per-word Arabic script derivation (shared by Understand phase) ===

// A token counts as a real word only if it contains at least one Arabic LETTER.
// Pure mark/number/control tokens (pause marks, sajdah/rub signs, the IndoPak
// small-high-tah U+0615, verse-number digits, and tokens polluted with ZWSP/RLM
// or private-use glyphs) sit between words in the script but aren't words —
// drop them so per-word splits line up. A blocklist of mark chars proved leaky
// against this dataset (missed U+0615, U+200B-prefixed marks, PUA glyphs), so
// we allowlist letters instead.
const ARABIC_LETTER = /[ء-يٮ-ۓەۮ-ۯۺ-ۿݐ-ݿࢠ-ࢽ]/;
export function isWordToken(token: string): boolean {
  return ARABIC_LETTER.test(token);
}

/**
 * Split an ayah's tajweed HTML into one colored-markup string per word. The tags
 * (<tajweed class=...>, <span class=end>) are space-free internally once tokenized,
 * so every space that lands in a TEXT run is a genuine word break. Callers drop the
 * end-marker token, filter mark-only tokens, and count-check against the word list.
 */
export function splitTajweedByWord(html: string): string[] {
  const tokens = html.match(/<[^>]+>|[^<]+/g) || [];
  const words: string[] = [];
  let current = '';
  for (const tok of tokens) {
    if (tok[0] === '<') {
      current += tok;
      continue;
    }
    const parts = tok.split(' ');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        if (current.trim()) words.push(current);
        current = '';
      }
      current += parts[i];
    }
  }
  if (current.trim()) words.push(current);
  return words;
}

export interface AyahWordData {
  words: Word[];
  /** per-word tajweed markup, or null when it doesn't align 1:1 with words */
  tajweedWords: string[] | null;
  /** per-word IndoPak text, or null when it doesn't align (common — different orthography) */
  indopakWords: string[] | null;
}

/** Per-word script data for an ayah, with count-checked fallbacks to plain Uthmani. */
export function buildAyahWordData(ayah: Ayah): AyahWordData {
  const words = realWords(ayah);
  let tajweedWords: string[] | null = null;
  if (ayah.textUthmaniTajweed) {
    // The letter test also drops the <span class=end>٢</span> verse-number token (digits only).
    const parts = splitTajweedByWord(ayah.textUthmaniTajweed)
      .filter((p) => isWordToken(p.replace(/<[^>]+>/g, '')));
    if (parts.length === words.length) tajweedWords = parts;
  }
  let indopakWords: string[] | null = null;
  if (ayah.textIndopak) {
    const parts = ayah.textIndopak.trim().split(/\s+/).filter(isWordToken);
    if (parts.length === words.length) indopakWords = parts;
  }
  return { words, tajweedWords, indopakWords };
}
