'use client';

import { useEffect, useState } from 'react';

/**
 * The time, refreshed every `everyMs` and when the app comes back to the
 * front, so a prayer's tick wakes up when its time begins without a reload.
 */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const onVisible = () => {
      if (!document.hidden) tick();
    };
    const id = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [everyMs]);
  return now;
}
