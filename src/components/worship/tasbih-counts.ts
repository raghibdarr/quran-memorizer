'use client';

import { useEssentialsStore } from '@/stores/essentials-store';
import { useWorshipStore } from '@/stores/worship-store';

// Tasbih counts live in the synced quran-essentials counters (spec 3.2, D3):
// one counter per dhikr id, shared with the Essentials cards. That store is
// written only through its existing actions (increment and reset); the
// lifetime total per id goes to worship-store.tasbihTotals.

/** The free counter's id in quran-essentials.counters */
export const FREE_COUNTER_ID = 'tasbih-free';

export function countOnce(id: string) {
  useEssentialsStore.getState().incrementCounter(id);
  useWorshipStore.getState().addTasbih(id, 1);
}

/**
 * Takes one count back. The essentials store has no decrement, so the counter
 * is rebuilt from zero with its existing actions (a handful of synchronous
 * writes for a tasbih-sized count).
 */
export function undoOnce(id: string) {
  const { counters, resetCounter, incrementCounter } = useEssentialsStore.getState();
  const n = counters[id] ?? 0;
  if (n <= 0) return;
  resetCounter(id);
  for (let i = 0; i < n - 1; i++) incrementCounter(id);
  useWorshipStore.getState().addTasbih(id, -1);
}

/** Back to zero; the lifetime total stays */
export function resetCount(id: string) {
  useEssentialsStore.getState().resetCounter(id);
}
