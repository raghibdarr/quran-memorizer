'use client';

import { useEffect, useState } from 'react';
import { getDeck } from '@/components/deen/deck-source';
import type { TextItem } from '@/types/deen';
import { NAWAWI_DECK } from './hadith-logic';

export type HadithDeckState =
  | { status: 'loading' }
  | { status: 'ready'; items: TextItem[] }
  | { status: 'missing' };

/** The emitted Forty (source-checked items only), loaded on this screen alone */
export function useHadithDeck(): HadithDeckState {
  const [state, setState] = useState<HadithDeckState>({ status: 'loading' });
  useEffect(() => {
    let live = true;
    getDeck(NAWAWI_DECK)
      .then((deck) => {
        if (!live) return;
        const items = (deck?.items ?? []) as TextItem[];
        setState(items.length ? { status: 'ready', items: [...items].sort((a, b) => (a.id < b.id ? -1 : 1)) } : { status: 'missing' });
      })
      .catch(() => live && setState({ status: 'missing' }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}
