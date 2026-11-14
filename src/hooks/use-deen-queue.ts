'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDeenStore } from '@/stores/deen-store';
import { liveDecks, type LiveDeck } from '@/components/deen/deck-source';
import { deenToday, type DeenToday } from '@/components/deen/queue-logic';
import { useDayClock } from './use-day-clock';

/** The live decks (loaded once per mount; null while loading) */
export function useLiveDecks(): LiveDeck[] | null {
  const [decks, setDecks] = useState<LiveDeck[] | null>(null);
  useEffect(() => {
    let live = true;
    liveDecks()
      .then((d) => live && setDecks(d))
      .catch(() => live && setDecks([]));
    return () => {
      live = false;
    };
  }, []);
  return decks;
}

/**
 * Today's deen queue (all-in-one spec 2.5): at most 20 reviews, most overdue
 * first, then new cards up to the daily new-card cap. `deck` narrows it to one
 * deck (/review/deen?deck=). `ready` is false until the live decks are known.
 * Deen cards never gate the Quran "day complete" and never badge the tab.
 */
export function useDeenQueue(deck?: string | null): DeenToday & { ready: boolean; decks: LiveDeck[] } {
  const cards = useDeenStore((s) => s.cards);
  const newPerDay = useDeenStore((s) => s.newPerDay);
  const introduced = useDeenStore((s) => s.introduced);
  const decks = useLiveDecks();
  const dayEnd = useDayClock();
  return useMemo(() => {
    const ids = (decks ?? []).map((d) => d.id);
    return { ...deenToday({ cards, newPerDay, introduced }, dayEnd, ids, deck), ready: decks !== null, decks: decks ?? [] };
  }, [cards, newPerDay, introduced, decks, dayEnd, deck]);
}
