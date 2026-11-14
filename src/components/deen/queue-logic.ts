// Today's deen queue, as the Review section and the session player read it
// (pure; the hook in src/hooks/use-deen-queue.ts feeds it the store and clock).
// buildDeenQueue (foundations) does the caps and ordering; this adds which decks
// count (only live ones, plus the glossary's term cards), today's introduced
// count, and the session order.

import { isoFromMs } from '@/lib/dates';
import { buildDeenQueue, DEEN_REVIEW_CAP, isNewCard, type DeenQueue } from '@/lib/deen/queue';
import type { DeenCard, DeenData } from '@/stores/deen-store';
import { GLOSSARY_DECK } from './deck-source';

export interface DeenToday extends DeenQueue {
  /** The session order: due reviews (most overdue first), then new cards */
  order: string[];
  /** Cards in live decks (any state, not suspended): the section hides at 0 */
  cardCount: number;
  /** The next time something falls due after today (null when nothing will) */
  nextDue: number | null;
}

export function deenToday(
  data: Pick<DeenData, 'cards' | 'newPerDay' | 'introduced'>,
  dayEnd: number,
  liveDeckIds: Iterable<string>,
  onlyDeck?: string | null,
): DeenToday {
  const live = new Set(liveDeckIds);
  live.add(GLOSSARY_DECK);
  const decks = onlyDeck ? (live.has(onlyDeck) ? [onlyDeck] : []) : [...live];
  const allow = new Set(decks);
  const q = buildDeenQueue(data.cards, dayEnd, {
    newPerDay: data.newPerDay,
    reviewCap: DEEN_REVIEW_CAP,
    introducedToday: data.introduced[isoFromMs(dayEnd)] ?? 0,
    decks,
  });
  let cardCount = 0;
  let nextDue: number | null = null;
  for (const c of Object.values(data.cards)) {
    if (c.suspended || !allow.has(c.deck)) continue;
    cardCount++;
    if (!isNewCard(c) && c.nextReview > dayEnd && (nextDue === null || c.nextReview < nextDue)) nextDue = c.nextReview;
  }
  return { ...q, order: [...q.due, ...q.fresh], cardCount, nextDue };
}

/** Whether rating this card introduces it (counts toward today's new-card cap) */
export const introducesCard = (c: DeenCard | undefined) => !!c && isNewCard(c);
