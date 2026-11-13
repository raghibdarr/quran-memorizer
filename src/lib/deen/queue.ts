// The deen review queue (all-in-one spec 2.5, 3.3): due reviews first (oldest
// due first, at most 20 a day), then new cards up to the daily new-card cap.
// Deen cards never gate the Quran "day complete" and never badge the tab.

import type { DeenCard } from '@/stores/deen-store';

export const DEEN_REVIEW_CAP = 20;

export interface DeenQueueOptions {
  newPerDay: number;
  reviewCap?: number;
  /** New cards already introduced today (deen-store `introduced[today]`) */
  introducedToday?: number;
  /** Only cards of these decks (e.g. the live ones, or one deck for ?deck=) */
  decks?: ReadonlySet<string> | readonly string[];
}

export interface DeenQueue {
  /** Card ids due for review, in order */
  due: string[];
  /** Never-reviewed card ids to introduce, in order */
  fresh: string[];
  /** All due reviews before the cap (for "12 due" counts) */
  dueTotal: number;
  /** Per deck: due reviews and new cards available today */
  perDeck: Record<string, { due: number; fresh: number }>;
}

export const isNewCard = (c: DeenCard) => c.lastReview === 0 && c.repetitions === 0;

/**
 * Build today's queue. `dayEnd` is the end of the user's local day (a card due
 * any time today is due now, as with lesson cards). Suspended cards never show.
 */
export function buildDeenQueue(cards: Record<string, DeenCard>, dayEnd: number, opts: DeenQueueOptions): DeenQueue {
  const reviewCap = opts.reviewCap ?? DEEN_REVIEW_CAP;
  const allow = opts.decks ? new Set(opts.decks) : null;
  const entries = Object.entries(cards).filter(([, c]) => !c.suspended && (!allow || allow.has(c.deck)));

  const dueAll = entries
    .filter(([, c]) => !isNewCard(c) && c.nextReview <= dayEnd)
    .sort(([ia, a], [ib, b]) => a.nextReview - b.nextReview || (ia < ib ? -1 : 1));
  const freshAll = entries
    .filter(([, c]) => isNewCard(c))
    .sort(([ia, a], [ib, b]) => a.addedAt - b.addedAt || (ia < ib ? -1 : 1));

  const room = Math.max(0, opts.newPerDay - (opts.introducedToday ?? 0));
  const due = dueAll.slice(0, reviewCap).map(([id]) => id);
  const fresh = freshAll.slice(0, room).map(([id]) => id);

  const perDeck: DeenQueue['perDeck'] = {};
  const bump = (deck: string, key: 'due' | 'fresh') => {
    perDeck[deck] ??= { due: 0, fresh: 0 };
    perDeck[deck][key]++;
  };
  for (const id of due) bump(cards[id].deck, 'due');
  for (const id of fresh) bump(cards[id].deck, 'fresh');

  return { due, fresh, dueTotal: dueAll.length, perDeck };
}
