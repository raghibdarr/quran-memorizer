// The Names of Allah screen's rules (pure; the screen feeds it the store and the clock).
//
// Cards (all-in-one spec 5.7): a Name gets `ar-en` (see the Name, recall its meaning)
// and `en-ar` (see the meaning, recall the Name). The depth setting picks which:
// "Know the meaning" (the deck's default) learns ar-en; "Memorise the Arabic" adds
// en-ar too. "Start learning" brings in the next Names in list order, a few a day
// (the learner's daily new-card number, 5 unless they changed it).

import { cardId, newDeenCard } from '@/lib/deen/cards';
import { isNewCard } from '@/lib/deen/queue';
import { deenToday } from '@/components/deen/queue-logic';
import type { DeenCard, DeenData } from '@/stores/deen-store';
import type { DeckDepth, NameItem, QuranRef } from '@/types/deen';

export const NAMES_DECK = 'names99';
export const DEFAULT_NAMES_PER_DAY = 5;

export type NameFacet = 'ar-en' | 'en-ar';

/** The facets a Name gets at a depth */
export function nameFacets(depth: DeckDepth): NameFacet[] {
  return depth === 'arabic' ? ['ar-en', 'en-ar'] : ['ar-en'];
}

/** How many Names one "Start learning" brings in */
export function batchSize(newPerDay: number | undefined): number {
  return newPerDay && newPerDay > 0 ? Math.round(newPerDay) : DEFAULT_NAMES_PER_DAY;
}

/** Ids of the Names that have any card (suspended included: they were started) */
export function startedNameIds(cards: Record<string, DeenCard>): Set<string> {
  const out = new Set<string>();
  const prefix = `${NAMES_DECK}:`;
  for (const id of Object.keys(cards)) if (id.startsWith(prefix)) out.add(id.slice(prefix.length).split(':')[0]);
  return out;
}

/** Names first brought in today (a Name's earliest card was added at or after dayStart) */
export function namesStartedSince(cards: Record<string, DeenCard>, dayStart: number): number {
  const first = new Map<string, number>();
  const prefix = `${NAMES_DECK}:`;
  for (const [id, c] of Object.entries(cards)) {
    if (!id.startsWith(prefix)) continue;
    const item = id.slice(prefix.length).split(':')[0];
    first.set(item, Math.min(first.get(item) ?? Infinity, c.addedAt));
  }
  let n = 0;
  for (const t of first.values()) if (t >= dayStart) n++;
  return n;
}

/**
 * What the review session would show of the Names right now. New cards share one
 * daily number across every deck, so Names just started are not always all in
 * today's session (ten cards at "Memorise the Arabic", or another deck's new
 * cards already seen today). `ready` is the cards a session opens with;
 * `waiting` is new cards held for a later day.
 */
export function namesReadiness(data: Pick<DeenData, 'cards' | 'newPerDay' | 'introduced'>, dayEnd: number): { ready: number; waiting: number } {
  const q = deenToday(data, dayEnd, [NAMES_DECK], NAMES_DECK);
  let fresh = 0;
  for (const c of Object.values(data.cards)) if (c.deck === NAMES_DECK && !c.suspended && isNewCard(c)) fresh++;
  return { ready: q.order.length, waiting: Math.max(0, fresh - q.fresh.length) };
}

/** Names cards not yet seen in a session (paused ones left out): while any remain, the screen offers no more */
export function unseenNameCards(cards: Record<string, DeenCard>): number {
  let n = 0;
  for (const c of Object.values(cards)) if (c.deck === NAMES_DECK && !c.suspended && isNewCard(c)) n++;
  return n;
}

/** The line under "Learn the Names" once something is in play: says only what the session will really show */
export function learnStatus({ today, ready, waiting }: { today: number; ready: number; waiting: number }): string {
  const lead = today > 0 ? `${today === 1 ? '1 new Name' : `${today} new Names`} today. ` : '';
  const cards = `${ready} ${ready === 1 ? 'card is' : 'cards are'}`;
  if (ready > 0 && waiting > 0) return `${lead}${cards} ready now; the rest follow on the coming days.`;
  const one = today === 1;
  if (ready > 0) return today > 0 ? `${lead}${one ? 'It is' : 'They are'} waiting in your reviews.` : `${cards} ready in your reviews.`;
  if (waiting > 0) return `${lead}${today > 0 ? (one ? 'Its cards come' : 'Their cards come') : 'The cards come'} into your reviews on the coming days.`;
  return `${lead}You have been through ${one ? 'it. It comes' : 'them. They come'} back in your reviews.`;
}

/** The next Names to learn, in list order, skipping any already started */
export function nextNames(items: NameItem[], cards: Record<string, DeenCard>, count: number): NameItem[] {
  const started = startedNameIds(cards);
  return [...items].sort((a, b) => a.order - b.order).filter((it) => !started.has(it.id)).slice(0, count);
}

/** New cards for these Names at this depth. Ordered so the first Name's cards come first in the queue. */
export function cardsForNames(items: NameItem[], depth: DeckDepth, now = Date.now()): Record<string, DeenCard> {
  const out: Record<string, DeenCard> = {};
  items.forEach((it, i) => {
    for (const f of nameFacets(depth)) {
      // addedAt orders new cards in the queue (oldest first): keep list order
      out[cardId(NAMES_DECK, it.id, f)] = newDeenCard(NAMES_DECK, it.rev, now + i);
    }
  });
  return out;
}

/**
 * What a depth change does to cards already made: moving to "Memorise the Arabic"
 * adds the en-ar card for every started Name (and wakes any it had paused);
 * moving back to "Know the meaning" pauses en-ar cards, keeping their history.
 */
export function depthChange(
  cards: Record<string, DeenCard>,
  items: NameItem[],
  depth: DeckDepth,
  now = Date.now(),
): { add: Record<string, DeenCard>; suspend: string[]; resume: string[] } {
  const started = startedNameIds(cards);
  const add: Record<string, DeenCard> = {};
  const suspend: string[] = [];
  const resume: string[] = [];
  for (const it of [...items].sort((a, b) => a.order - b.order)) {
    if (!started.has(it.id)) continue;
    const id = cardId(NAMES_DECK, it.id, 'en-ar');
    const c = cards[id];
    if (depth === 'arabic') {
      if (!c) add[id] = newDeenCard(NAMES_DECK, it.rev, now + it.order);
      else if (c.suspended) resume.push(id);
    } else if (c && !c.suspended) suspend.push(id);
  }
  return { add, suspend, resume };
}

export const EVIDENCE_LABEL: Record<NameItem['evidence']['kind'], { short: string; long: string }> = {
  'quran-name': { short: 'In the Quran', long: 'Named in the Quran' },
  'quran-derived': { short: 'From the Quran', long: 'Taken from a word the Quran uses of Allah' },
  hadith: { short: 'From a hadith', long: 'Named by the Prophet ﷺ in a hadith' },
  'list-only': { short: 'List only', long: 'Found in the enumerated list only, not as a Name in the Quran' },
};

/** The reader, opened at an ayah */
export function readerHref(ref: QuranRef): string {
  return `/listen?s=${ref.surahId}&a=${ref.ayah}`;
}

/** "59:23" or "55:26-27" */
export function refLabel(ref: QuranRef): string {
  return `${ref.surahId}:${ref.ayah}${ref.ayahEnd && ref.ayahEnd !== ref.ayah ? `-${ref.ayahEnd}` : ''}`;
}

/** The Names in list order, with every item a Name (an emitted names deck holds nothing else) */
export function sortNames(items: unknown[]): NameItem[] {
  return (items as NameItem[]).filter((it) => typeof it?.order === 'number').sort((a, b) => a.order - b.order);
}
