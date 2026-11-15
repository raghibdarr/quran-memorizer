// Pure helpers for the /hadith screens (hadith-nawawi40 package).

import type { ItemState } from '@/components/deen/item-state';
import { collectionName, scholarName } from '@/components/deen/registry-names';
import type { Citation, Grading, TextItem } from '@/types/deen';

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

/** Our translation in paragraphs: authored breaks (a blank line) sit where the Arabic segments end */
export function translationParagraphs(text: string | undefined): string[] {
  return (text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export interface LearnActions {
  /** Whether the Arabic is still to memorise, or the recall card already exists */
  memorise: 'start' | 'again';
  /** Label of the memorise action: the flow keeps existing cards and adds only the missing ones */
  memoriseLabel: string;
  /** Offer "Just learn the meaning" only while the meaning card does not exist yet */
  offerMeaning: boolean;
}

/**
 * What the hadith screen offers, from the card ids the learner already has.
 * Someone who took "Just learn the meaning" has not memorised the Arabic yet,
 * so the main action still says "Start memorising" until the recall card exists;
 * after that, going through it again is only a quiet link.
 */
export function learnActions(cardIds: Iterable<string>, itemId: string, deck: string = NAWAWI_DECK): LearnActions {
  const have = new Set(cardIds);
  const recall = have.has(`${deck}:${itemId}:recall`);
  const meaning = have.has(`${deck}:${itemId}:meaning`);
  return recall
    ? { memorise: 'again', memoriseLabel: 'Go through it again', offerMeaning: !meaning }
    : { memorise: 'start', memoriseLabel: 'Start memorising', offerMeaning: !meaning };
}

export interface SourceRows {
  /** The collections that carry it, without the Forty itself (the screen already says which hadith of the Forty it is) */
  citations: Citation[];
  /** "In a Sahih collection" gradings that only restate one of those citations */
  inSahih: Grading[];
  /** Every other grading, shown in full with its scholar and work */
  gradings: Grading[];
}

/** The Source panel of the hadith screen, without saying the same thing twice */
export function sourceRows(item: Pick<TextItem, 'citations' | 'gradings'>, deck: string = NAWAWI_DECK): SourceRows {
  const citations = item.citations.filter((c) => c.collection !== deck);
  const restates = (g: Grading) =>
    g.grade === 'in-sahih' && citations.some((c) => g.in === `${collectionName(c.collection)}, no. ${c.number}`);
  return {
    citations: citations.length ? citations : item.citations,
    inSahih: item.gradings.filter(restates),
    gradings: item.gradings.filter((g) => !restates(g)),
  };
}

/** "In both Sahih collections: al-Bukhari and Muslim ibn al-Hajjaj", always naming who compiled them */
export function inSahihLine(gradings: Pick<Grading, 'by'>[]): string {
  const names = gradings.map((g) => scholarName(g.by));
  if (!names.length) return '';
  const both = gradings.length === 2 && new Set(gradings.map((g) => g.by)).size === 2 && gradings.every((g) => g.by === 'al-bukhari' || g.by === 'muslim');
  const label = both ? 'In both Sahih collections' : names.length === 1 ? 'In a Sahih collection' : 'In Sahih collections';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${label}: ${list}`;
}
