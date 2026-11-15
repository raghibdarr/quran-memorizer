// Pure helpers for the /hadith screens (hadith-nawawi40 package).

import type { ItemState } from '@/components/deen/item-state';
import type { TextItem } from '@/types/deen';

export const NAWAWI_DECK = 'nawawi40';
/** How many narrations al-Nawawi's collection holds (his forty-two) */
export const NAWAWI_TOTAL = 42;

/** "01" → 1: the number al-Nawawi gave the narration */
export function hadithNumber(id: string): number {
  return Number.parseInt(id, 10);
}

/** /hadith/view?id=01 */
export function hadithHref(id: string): string {
  return `/hadith/view?id=${encodeURIComponent(id)}`;
}

/** A requested id as the deck spells it ("1", "01" → "01"), or null when it is not a number in range */
export function normaliseHadithId(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{1,2}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  if (n < 1 || n > NAWAWI_TOTAL) return null;
  return String(n).padStart(2, '0');
}

export interface DeckProgress {
  /** Items with cards (any state but new) */
  started: number;
  /** Items whose cards have all settled */
  strong: number;
  /** Items with a card due today */
  due: number;
  /** Items in the deck */
  total: number;
}

export function deckProgress(items: Pick<TextItem, 'id'>[], states: Record<string, ItemState>): DeckProgress {
  let started = 0;
  let strong = 0;
  let due = 0;
  for (const { id } of items) {
    const s = states[id] ?? 'new';
    if (s !== 'new') started++;
    if (s === 'strong') strong++;
    if (s === 'due') due++;
  }
  return { started, strong, due, total: items.length };
}

/** One line under the progress bar: plain, never a scold */
export function progressLine(p: DeckProgress): string {
  if (p.total === 0) return '';
  if (p.started === 0) return `${p.total} hadith to learn, one at a time.`;
  const parts = [`${p.started} of ${p.total} started`];
  if (p.strong) parts.push(`${p.strong} strong`);
  return parts.join(' · ');
}

/** The items either side of one, in al-Nawawi's order */
export function neighbours<T extends { id: string }>(items: T[], id: string): { prev: T | null; next: T | null } {
  const i = items.findIndex((it) => it.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: items[i - 1] ?? null, next: items[i + 1] ?? null };
}

/**
 * The Arabic split for reading: each authored segment on its own line (they end
 * at sentence ends), or the whole text when there are none.
 */
export function readingParts(arabic: string, segments?: number[]): string[] {
  const text = arabic.trim();
  if (!segments?.length) return text ? [text] : [];
  const out: string[] = [];
  let start = 0;
  for (const end of segments) {
    const part = text.slice(start, Math.min(end, text.length)).trim();
    if (part) out.push(part);
    start = Math.min(end, text.length);
  }
  const rest = text.slice(start).trim();
  if (rest) out.push(rest);
  return out;
}
