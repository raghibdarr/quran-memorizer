'use client';

import { useEffect, useState } from 'react';
import { getDeck, liveDecks, type LiveDeck } from '@/components/deen/deck-source';
import type { TextItem } from '@/types/deen';

/** The five adhkar decks this package ships, in the order the index lists them */
export const ADHKAR_DECK_IDS = ['adhkar-morning-evening', 'adhkar-after-prayer', 'adhkar-sleep-waking', 'duas-daily', 'salah-words'] as const;

export type DeckLoad = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; items: TextItem[] };

/**
 * One adhkar deck's shipped items. Goes through the deen engine's deck source,
 * so a hidden deck (ready: false) reads as missing and an end-to-end test can
 * hand in a deck of its own.
 */
export function useAdhkarDeck(id: string | null): DeckLoad {
  const [state, setState] = useState<{ id: string | null; load: DeckLoad }>({ id: null, load: { status: 'loading' } });
  useEffect(() => {
    if (!id) return;
    let live = true;
    getDeck(id)
      .then((deck) => {
        if (!live) return;
        const items = (deck?.items ?? []) as TextItem[];
        setState({ id, load: deck && deck.kind !== 'names' && deck.kind !== 'course' ? { status: 'ready', items } : { status: 'missing' } });
      })
      .catch(() => live && setState({ id, load: { status: 'missing' } }));
    return () => {
      live = false;
    };
  }, [id]);
  if (!id) return { status: 'missing' };
  return state.id === id ? state.load : { status: 'loading' };
}

/** The live adhkar decks (registry order), null while loading */
export function useAdhkarDecks(): LiveDeck[] | null {
  const [decks, setDecks] = useState<LiveDeck[] | null>(null);
  useEffect(() => {
    let live = true;
    liveDecks()
      .then((all) => live && setDecks(all.filter((d) => d.group === 'adhkar')))
      .catch(() => live && setDecks([]));
    return () => {
      live = false;
    };
  }, []);
  return decks;
}
