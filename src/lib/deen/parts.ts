// The parts a deen text is memorised by (content/deen/STYLE.md, "Learning
// parts"), and the units the Build step walks through. Pure: no React, no store.

import type { TextItem } from '@/types/deen';

/** One part to learn: its Arabic and, under it, the matching piece of our translation */
export interface LearnPart {
  ar: string;
  en: string | null;
}

type Parted = Pick<TextItem, 'arabic' | 'translation' | 'parts' | 'segments'>;

const tidy = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Cut `text` at `ends` (character offsets, each the end of a part) */
function cut(text: string, ends: number[]): string[] {
  let start = 0;
  return ends.map((end) => {
    const piece = tidy(text.slice(start, end));
    start = end;
    return piece;
  });
}

/** Whether the authored parts can be used as they are (the build checks them; this guards a stale bundle) */
function usable(item: Parted): item is Parted & { arabic: string; parts: { ar: number[]; en: number[] } } {
  const p = item.parts;
  if (!p || !item.arabic || p.ar.length < 2) return false;
  const rising = (ends: number[], len: number) => ends.every((e, i) => e > (ends[i - 1] ?? 0) && e <= len);
  if (!rising(p.ar, item.arabic.length) || p.ar[p.ar.length - 1] !== item.arabic.length) return false;
  return true;
}

/**
 * The parts of an item: its authored parts, each with its English, or the whole
 * text as one part when none were authored. A text is never cut anywhere else:
 * an automatic split once broke a narrator's name in two.
 */
export function itemParts(item: Parted): LearnPart[] {
  const arabic = tidy(item.arabic ?? '');
  if (!arabic) return [];
  const whole = item.translation ? tidy(item.translation) : null;
  if (!usable(item)) return [{ ar: arabic, en: whole }];
  const ar = cut(item.arabic, item.parts.ar);
  const enOk =
    !!item.translation &&
    item.parts.en.length === item.parts.ar.length &&
    item.parts.en.every((e, i, all) => e > (all[i - 1] ?? 0) && e <= item.translation!.length);
  const en = enOk ? cut(item.translation!, item.parts.en) : null;
  return ar.map((a, i) => ({ ar: a, en: en?.[i] || null }));
}

/**
 * Which parts make up each reading paragraph (`segments`): [[0, 1, 2], [3, 4]].
 * One group holding every part when the item has no segments.
 */
export function partGroups(item: Parted): number[][] {
  const count = itemParts(item).length;
  const all = [Array.from({ length: count }, (_, i) => i)];
  if (!usable(item) || !item.segments?.length) return all;
  const text = item.arabic;
  const groups: number[][] = [];
  let next = 0;
  for (const raw of item.segments) {
    // An offset inside a word means that word's end, as everywhere segments are read
    let end = Math.min(raw, text.length);
    while (end < text.length && !/\s/.test(text[end])) end++;
    const group: number[] = [];
    while (next < count && item.parts.ar[next] <= end) group.push(next++);
    if (group.length) groups.push(group);
  }
  if (next < count) groups.push(Array.from({ length: count - next }, (_, i) => next + i));
  return groups.length ? groups : all;
}

/** One stop of the Build step: a single part, or several said together */
export type BuildUnit =
  | { kind: 'part'; index: number; label: string }
  | { kind: 'chain'; from: number; to: number; whole: boolean; label: string };

/**
 * The Build step's route through `count` parts: each part in turn; after a
 * reading paragraph of two or more parts (when the text has several
 * paragraphs), those parts together; and at the end, all of it together. A
 * text learned whole is a single unit with no label.
 */
export function buildUnits(count: number, groups: number[][] = []): BuildUnit[] {
  if (count <= 0) return [];
  if (count === 1) return [{ kind: 'part', index: 0, label: '' }];
  const units: BuildUnit[] = [];
  const paragraphs = groups.length > 1 ? groups : [];
  const endsGroup = new Map(paragraphs.filter((g) => g.length > 1).map((g) => [g[g.length - 1], g]));
  for (let i = 0; i < count; i++) {
    units.push({ kind: 'part', index: i, label: `Part ${i + 1} of ${count}` });
    const group = endsGroup.get(i);
    if (group) units.push({ kind: 'chain', from: group[0], to: i, whole: false, label: `Parts ${group[0] + 1} to ${i + 1} together` });
  }
  units.push({ kind: 'chain', from: 0, to: count - 1, whole: true, label: 'All together' });
  return units;
}

/** Honorific signs written as one glyph (ﷺ and its kin): they belong to the word before */
const HONORIFIC = /^[ﷺﷻ﵀-﵏]+$/;
/** Punctuation and quote marks at a word's edges: they would give the order away */
const EDGE_MARKS = /^[«»﴿﴾"“”‘’()[\]،؛.:؟!?,;]+|[«»﴿﴾"“”‘’()[\]،؛.:؟!?,;]+$/g;

/**
 * The words of a part as tiles for the put-in-order step: punctuation is
 * dropped from each word's edges, and an honorific sign stays with its word.
 */
export function orderWords(arabic: string): string[] {
  const out: string[] = [];
  for (const raw of arabic.split(/\s+/).filter(Boolean)) {
    const word = raw.replace(EDGE_MARKS, '');
    if (!word) continue;
    if (HONORIFIC.test(word) && out.length) out[out.length - 1] += ` ${word}`;
    else out.push(word);
  }
  return out;
}

/** Fewest tiles worth ordering, and the most that stay usable on a phone */
export const ORDER_MIN = 3;
export const ORDER_MAX = 12;

/**
 * What the learner orders: all of a part's words up to `max`; for a longer
 * part its opening words are already in place (`lead`) and the last `max` are
 * the tiles. Null when there are too few words to make ordering a question.
 */
export function orderBank(words: string[], max = ORDER_MAX): { lead: string[]; bank: string[] } | null {
  if (words.length < ORDER_MIN) return null;
  const lead = words.slice(0, Math.max(0, words.length - max));
  return { lead, bank: words.slice(lead.length) };
}

/** The narrator named in an item's citations (the first one that names one) */
export function narratorOf(item: Pick<TextItem, 'citations'>): string | null {
  return item.citations.find((c) => c.narrator)?.narrator ?? null;
}
