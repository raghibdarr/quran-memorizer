// Mutashabihat practice (roadmap #09): tell near-identical ayahs apart. Pure.
//
// Each question shows an ayah you've memorised with the words that differ from its
// twin blanked out, and asks which wording belongs here: its own, or the twin's.

export type Twin = { k: string; d: number[]; t: number[] };
export type TwinMap = Record<string, Twin[]>;

export interface QuizPair {
  /** The ayah being asked about ("2:35") and the word indexes blanked in it */
  key: string;
  blanks: number[];
  /** Its twin and the twin's differing word indexes */
  twin: string;
  twinWords: number[];
}

/** Deterministic shuffle (a seeded LCG), so a session is stable across re-renders */
export function shuffle<T>(list: T[], seed: number): T[] {
  const out = [...list];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Pick up to `count` pairs for ayahs you know: one question per unordered pair,
 * preferring pairs where you know both ayahs (the real slip risk), then the rest.
 */
export function pickPairs(twins: TwinMap, known: (key: string) => boolean, count: number, seed: number): QuizPair[] {
  const both: QuizPair[] = [];
  const one: QuizPair[] = [];
  const seen = new Set<string>();
  for (const [key, list] of Object.entries(twins)) {
    if (!known(key)) continue;
    for (const t of list) {
      const id = [key, t.k].sort().join('|');
      if (seen.has(id) || t.d.length === 0 || t.t.length === 0) continue;
      seen.add(id);
      (known(t.k) ? both : one).push({ key, blanks: t.d, twin: t.k, twinWords: t.t });
    }
  }
  return [...shuffle(both, seed), ...shuffle(one, seed + 1)].slice(0, count);
}

/** The two answers: this ayah's own words at the blanks, and the twin's words that stand there */
export function answers(pair: QuizPair, words: string[], twinWords: string[]): { right: string; wrong: string } | null {
  const right = pair.blanks.map((i) => words[i]).filter(Boolean).join(' ');
  const wrong = pair.twinWords.map((i) => twinWords[i]).filter(Boolean).join(' ');
  if (!right || !wrong || right === wrong) return null;
  return { right, wrong };
}
