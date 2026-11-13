// Making review cards from deen items (all-in-one spec 5.7). Card ids are
// `<deck>:<itemId>:<facet>`; the SM-2 fields start exactly like a new lesson
// card, so the one SM-2 core (reviewSm2) schedules them.

import { addLocalDays, startOfDayMs } from '@/lib/dates';
import type { DeenCard } from '@/stores/deen-store';
import type { DeckDepth, DeckKind, Lesson, NameItem, School, TextItem } from '@/types/deen';

export type Facet = 'recall' | 'meaning' | 'narrator' | 'usage' | 'ar-en' | 'en-ar' | 'term' | string;

export function cardId(deck: string, itemId: string, facet: Facet): string {
  return `${deck}:${itemId}:${facet}`;
}

export function parseCardId(id: string): { deck: string; itemId: string; facet: string } | null {
  const parts = id.split(':');
  if (parts.length !== 3 || parts.some((p) => !p)) return null;
  return { deck: parts[0], itemId: parts[1], facet: parts[2] };
}

/** A card due now, never reviewed */
export function newDeenCard(deck: string, itemRev: number, now = Date.now()): DeenCard {
  return {
    deck,
    itemRev,
    addedAt: now,
    easeFactor: 2.5,
    interval: 0,
    repetitions: 0,
    nextReview: startOfDayMs(now),
    lastReview: 0,
    lastQuality: 0,
  };
}

/**
 * A card for something the user already marked as memorised (an Essentials
 * `memorized` flag): conservative "shaky" strength, staggered over the next week,
 * lastReview 0 so any real review wins a sync merge (like createSeededCard).
 */
export function seededDeenCard(deck: string, itemRev: number, stagger = 0, now = Date.now()): DeenCard {
  return {
    deck,
    itemRev,
    addedAt: now,
    easeFactor: 2.3,
    interval: 3,
    repetitions: 1,
    nextReview: addLocalDays(now, 1 + (stagger % 7)),
    lastReview: 0,
    lastQuality: 3,
  };
}

/** The glossary card, made only when the user taps "Learn this term" */
export function termCard(termId: string, now = Date.now()): Record<string, DeenCard> {
  return { [cardId('glossary', termId, 'term')]: newDeenCard('glossary', 1, now) };
}

export interface CardOptions {
  depth: DeckDepth;
  school: School | null;
  now?: number;
}

/** The facets an item gets, per its deck's kind and the learner's depth */
export function facetsFor(kind: DeckKind, item: TextItem | NameItem | Lesson, opts: Pick<CardOptions, 'depth'>): Facet[] {
  if (kind === 'names') return ['ar-en', 'en-ar'];
  if (kind === 'course') return [];
  const text = item as TextItem;
  // A Quranic item hands off to the normal ayah review: no duplicate cards
  if (text.quran) return [];
  const facets: Facet[] = [];
  if (opts.depth === 'arabic' && text.arabic) facets.push('recall');
  if (text.translation) facets.push('meaning');
  if (kind === 'hadith' && text.citations?.some((c) => c.narrator)) facets.push('narrator');
  if (kind === 'dhikr' && text.usage?.when?.length) facets.push('usage');
  return facets;
}

/**
 * The cards a course lesson adds: every claim card without a school, plus, when
 * the user chose a school, that school's card (the others show on its back as
 * "also held"). Without a chosen school no school card is added.
 */
export function lessonCardIds(deck: string, lesson: Lesson, school: School | null): string[] {
  const ids: string[] = [];
  for (const claim of lesson.claims) {
    for (const c of claim.cards) {
      if (!c.school || c.school === school) ids.push(cardId(deck, lesson.id, c.id));
    }
  }
  return ids;
}

/** New cards for one item (existing ones are left to the store's addCards, which never overwrites) */
export function cardsForItem(deck: string, kind: DeckKind, item: TextItem | NameItem | Lesson, opts: CardOptions): Record<string, DeenCard> {
  const now = opts.now ?? Date.now();
  const ids = kind === 'course'
    ? lessonCardIds(deck, item as Lesson, opts.school)
    : facetsFor(kind, item, opts).map((f) => cardId(deck, item.id, f));
  return Object.fromEntries(ids.map((id) => [id, newDeenCard(deck, item.rev, now)]));
}
