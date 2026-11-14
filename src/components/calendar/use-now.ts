'use client';

import { useEffect, useState } from 'react';

/** Date.now(), refreshed every `everyMs` and when the screen comes back into view */
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
