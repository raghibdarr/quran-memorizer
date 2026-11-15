'use client';

import { useEffect } from 'react';
import { getDeck } from '@/components/deen/deck-source';
import { decksNeeded, planEssentialsMigration, readMigrated, writeMigrated } from '@/lib/deen-migrate-essentials';
import { useDeenStore } from '@/stores/deen-store';
import { useEssentialsStore } from '@/stores/essentials-store';
import type { TextItem } from '@/types/deen';

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let running = false;

/** Carries memorised Essentials items over to seeded deen cards (see deen-migrate-essentials.ts) */
export async function runEssentialsMigration(now = Date.now()): Promise<number> {
  if (running) return 0;
  running = true;
  try {
    const memorized = useEssentialsStore.getState().memorized;
    const done = readMigrated(storage());
    const needed = decksNeeded(memorized, done);
    if (!needed.length) return 0;
    const decks: Record<string, TextItem[]> = {};
    for (const id of needed) {
      const deck = await getDeck(id).catch(() => null);
      if (deck) decks[id] = deck.items as TextItem[];
    }
    const plan = planEssentialsMigration({ memorized, done, decks, existing: useDeenStore.getState().cards, now });
    if (Object.keys(plan.cards).length) useDeenStore.getState().addCards(plan.cards);
    if (plan.migrated.length) writeMigrated(storage(), [...done, ...plan.migrated]);
    return Object.keys(plan.cards).length;
  } finally {
    running = false;
  }
}

function hydrated(store: { persist?: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void } }, fn: () => void): () => void {
  if (!store.persist || store.persist.hasHydrated()) {
    fn();
    return () => {};
  }
  return store.persist.onFinishHydration(fn);
}

/**
 * Runs the Essentials carry-over once both stores have loaded. Mounted on the
 * adhkar screens and the Essentials cards (an app-wide mount is in HANDOFF.md).
 */
export function useEssentialsMigration() {
  useEffect(() => {
    let left = 2;
    const go = () => {
      left -= 1;
      if (left === 0) void runEssentialsMigration();
    };
    const a = hydrated(useEssentialsStore as never, go);
    const b = hydrated(useDeenStore as never, go);
    return () => {
      a();
      b();
    };
  }, []);
}
