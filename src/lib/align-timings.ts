/**
 * Aligns a reciter's word timings to OUR word list. The timing sources number words
 * their own way: they split some words ours keeps whole, chiefly the vocative
 * (يَـٰٓأَيُّهَا → يَا + أَيُّهَا, about 350 ayahs), هَـٰٓأَنتُمْ, and the two-part
 * words written with a space (بَعْدَ مَا, إِلْ يَاسِينَ). Left unaligned, every word
 * after the split is off by one: the highlight jumps ahead, a tapped word plays
 * the wrong audio, and part-of-ayah audio cuts in the wrong place.
 *
 * Dependency-free so scripts/align-segments.mts can run it under Node directly.
 */

export type Row = [word: number, startMs: number, endMs: number];

const PAUSE_MARKS = /[ۖ-ۜ۞]/g;
const clean = (w: string) => w.replace(/۞/g, '').replace(PAUSE_MARKS, '').trim();

/** How many extra timing words each of our words might have been split into, and how likely. */
export function splitCandidates(words: string[]): { i: number; max: number; prior: number }[] {
  const out: { i: number; max: number; prior: number }[] = [];
  words.forEach((raw, i) => {
    const w = clean(raw);
    // letters only, for words whose marks may be stored in either order (shadda + fatha)
    const bare = w.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    const spaces = (w.match(/\s+/g) ?? []).length;
    if (spaces) out.push({ i, max: spaces, prior: 3 });
    else if (/^[وف]?يبنؤم/.test(bare)) out.push({ i, max: 2, prior: 3 }); // يَبْنَؤُمَّ: يَا + ابْنَ + أُمَّ
    else if (/^وألو/.test(bare)) out.push({ i, max: 1, prior: 3 }); // وَأَلَّوِ: وَأَنْ + لَوِ
    else if (/^(?:[وف]َ)?يَـ?ٰٓ?أَيُّهَا/.test(w)) out.push({ i, max: 1, prior: 2 });
    else if (/^(?:[وف]َ)?يَـ?ٰ/.test(w)) out.push({ i, max: 1, prior: 1 });
    else if (/^هَـ?ٰٓ?أَنتُمْ/.test(w)) out.push({ i, max: 1, prior: 1 });
    else if (/^هَـ?ٰٓ?ؤُلَآءِ/.test(w)) out.push({ i, max: 1, prior: 0.5 });
  });
  return out;
}

/** Our word index for each timing word (1-based in, 0-based out), given how many extra pieces each word has. */
function mapping(nWords: number, extra: number[]): number[] {
  const map: number[] = [];
  for (let i = 0; i < nWords; i++) for (let k = 0; k <= extra[i]; k++) map.push(i);
  return map;
}

/** Merge timing rows onto our words: each word spans the earliest start to the latest end of its pieces. */
function merge(rows: Row[], map: (t: number) => number): Row[] {
  const byWord = new Map<number, Row>();
  for (const [t, s, e] of rows) {
    const w = map(t) + 1;
    const cur = byWord.get(w);
    byWord.set(w, cur ? [w, Math.min(cur[1], s), Math.max(cur[2], e)] : [w, s, e]);
  }
  return [...byWord.values()].sort((a, b) => a[0] - b[0]);
}

export type AlignMethod = 'exact' | 'split' | 'proportional' | 'short';

export function alignAyah(words: string[], rows: Row[]): { rows: Row[]; method: AlignMethod } {
  if (!rows.length) return { rows, method: 'exact' };
  const timingWords = Math.max(...rows.map((r) => r[0]));
  const surplus = timingWords - words.length;
  if (surplus === 0) return { rows, method: 'exact' };
  // Fewer timing words than ours: the aligner missed some; nothing to merge
  if (surplus < 0) return { rows, method: 'short' };

  const cands = splitCandidates(words);
  const startOf = new Map(rows.map((r) => [r[0], r]));
  let best: { score: number; extra: number[] } | null = null;

  const extra = new Array(words.length).fill(0);
  const search = (c: number, left: number, prior: number) => {
    if (left === 0) {
      // Evidence: the first piece of a real split is a blip, or overlaps the next piece
      const map = mapping(words.length, extra);
      let evidence = 0;
      for (const { i } of cands) {
        if (!extra[i]) continue;
        const t = map.indexOf(i) + 1;
        const a = startOf.get(t), b = startOf.get(t + 1);
        if (a && (a[2] - a[1] < 150 || (b && b[1] <= a[2]))) evidence += 2; // timing evidence outweighs the prior
      }
      const score = prior + evidence;
      if (!best || score > best.score) best = { score, extra: extra.slice() };
      return;
    }
    if (c >= cands.length) return;
    const { i, max, prior: p } = cands[c];
    for (let e = Math.min(max, left); e >= 0; e--) {
      extra[i] = e;
      search(c + 1, left - e, prior + e * p);
    }
    extra[i] = 0;
  };
  search(0, surplus, 0);

  if (best) {
    const map = mapping(words.length, (best as { extra: number[] }).extra);
    return { rows: merge(rows, (t) => map[t - 1]), method: 'split' };
  }
  // No explanation found: spread the timing words evenly over ours
  const n = words.length;
  return { rows: merge(rows, (t) => Math.min(n - 1, Math.floor(((t - 1) * n) / timingWords))), method: 'proportional' };
}
