'use client';

import { useCallback } from 'react';
import { madeUpSurplus } from '@/lib/worship/ramadan';
import { useWorshipStore, type FastMark } from '@/stores/worship-store';

/**
 * Mark a day (or clear it with null). If that leaves more make-up fasts counted
 * than days marked "to make up", the extra is taken back, so it can't tick off
 * a day marked later.
 */
export function useMarkFast(): (iso: string, mark: FastMark | null) => void {
  return useCallback((iso, mark) => {
    const st = useWorshipStore.getState();
    if (mark) st.markFast(iso, mark);
    else st.clearFast(iso);
    const after = useWorshipStore.getState();
    const extra = madeUpSurplus(after.fasts, after.madeUp.fasts);
    if (extra > 0) after.addMadeUp('fasts', -extra);
  }, []);
}
