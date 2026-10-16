/**
 * The first-letter cue for a word (hide-words recall, M10): the opening letter with
 * its marks, then a tatweel when that letter joins onward, so the cue reads as the
 * start of a word. Words opening with the article (ٱلْحَمْدُ) or a one-letter prefix and
 * the article (وَٱلَّذِينَ) show through the next letter: "ٱ" alone, on most words of
 * the Quran, would cue nothing.
 */

const MARKS = '\\u064B-\\u065F\\u0670\\u06D6-\\u06ED';
const LETTER_WITH_MARKS = `[^\\s${MARKS}\\u0640][${MARKS}]*`;
const ARTICLE = new RegExp(`^((?:[وفبكل][${MARKS}]*)?[ٱا][${MARKS}]*ل[${MARKS}]*)(${LETTER_WITH_MARKS})`);
const FIRST = new RegExp(`^${LETTER_WITH_MARKS}`);
/** Letters that never join to the next one: no tatweel after these */
const NON_JOINING = new Set([...'اأإآٱدذرزوؤةىء']);

export function firstLetters(word: string): string {
  const w = word.replace(/[ۖ-ۜ۞]/g, '').trim();
  const m = ARTICLE.exec(w);
  const cue = m && m[0].length < w.length ? m[1] + m[2] : FIRST.exec(w)?.[0] ?? w;
  if (cue.length >= w.length) return w;
  const lastLetter = cue.replace(new RegExp(`[${MARKS}]`, 'g'), '').slice(-1);
  return NON_JOINING.has(lastLetter) ? cue : cue + 'ـ';
}
