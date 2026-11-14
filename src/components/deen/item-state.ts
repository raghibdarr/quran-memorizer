'use client';

import { useMemo } from 'react';
import { isNewCard } from '@/lib/deen/queue';
import { useDeenStore, type DeenCard } from '@/stores/deen-store';
import { useDayClock } from '@/hooks/use-day-clock';

/**
 * Where a learner is with one item, for list screens:
 * - new: no cards yet
 * - learning: cards exist, not yet settled
 * - due: a card has come back for review today
 * - strong: every card has held for three weeks or more
 */
export type ItemState = 'new' | 'learning' | 'due' | 'strong';

/** Days between reviews at which a card counts as settled */
export const STRONG_INTERVAL_DAYS = 21;

export const ITEM_STATE_LABEL: Record<ItemState, string> = {
  new: 'Not started',
  learning: 'Learning',
  due: 'Due today',
  strong: 'Strong',
};

/** The cards of one item (by id prefix `<deck>:<itemId>:`), suspended ones left out */
export function itemCards(cards: Record<string, DeenCard>, deck: string, itemId: string): DeenCard[] {
  const prefix = `${deck}:${itemId}:`;
  const out: DeenCard[] = [];
  for (const [id, c] of Object.entries(cards)) if (id.startsWith(prefix) && !c.suspended) out.push(c);
  return out;
}

export function stateOfCards(list: DeenCard[], dayEnd: number): ItemState {
  if (list.length === 0) return 'new';
  if (list.some((c) => !isNewCard(c) && c.nextReview <= dayEnd)) return 'due';
  if (list.every((c) => !isNewCard(c) && c.interval >= STRONG_INTERVAL_DAYS)) return 'strong';
  return 'learning';
}

export function itemStateOf(cards: Record<string, DeenCard>, deck: string, itemId: string, dayEnd: number): ItemState {
  return stateOfCards(itemCards(cards, deck, itemId), dayEnd);
}

/** Every item's state in one deck (items with no cards are absent: they are 'new') */
export function deckStatesOf(cards: Record<string, DeenCard>, deck: string, dayEnd: number): Record<string, ItemState> {
  const byItem: Record<string, DeenCard[]> = {};
  const prefix = `${deck}:`;
  for (const [id, c] of Object.entries(cards)) {
    if (!id.startsWith(prefix) || c.suspended) continue;
    const itemId = id.slice(prefix.length).split(':')[0];
    (byItem[itemId] ??= []).push(c);
  }
  return Object.fromEntries(Object.entries(byItem).map(([id, list]) => [id, stateOfCards(list, dayEnd)]));
}

/** One item's state, live with the store and the day */
export function useItemState(deck: string, itemId: string): ItemState {
  const cards = useDeenStore((s) => s.cards);
  const dayEnd = useDayClock();
  return useMemo(() => itemStateOf(cards, deck, itemId, dayEnd), [cards, deck, itemId, dayEnd]);
}

/** Every item's state in a deck, for list screens: `states[id] ?? 'new'` */
export function useDeckStates(deck: string): Record<string, ItemState> {
  const cards = useDeenStore((s) => s.cards);
  const dayEnd = useDayClock();
  return useMemo(() => deckStatesOf(cards, deck, dayEnd), [cards, deck, dayEnd]);
}
