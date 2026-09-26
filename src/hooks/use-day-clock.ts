'use client';

import { useEffect, useState } from 'react';
import { endOfDayMs } from '@/lib/dates';

/**
 * "Now" for day-level scheduling: the LAST millisecond of the current local day.
 * It only changes when the local day changes (checked every minute and on tab
 * return), so screens left open overnight roll over to the new day by
 * themselves, without re-rendering every minute. Anything due at any point
 * today counts as due. Pass it as `now` to the pure schedulers.
 */
export function useDayClock(): number {
  const [dayEnd, setDayEnd] = useState(() => endOfDayMs(Date.now()));

  useEffect(() => {
    const check = () => {
      const next = endOfDayMs(Date.now());
      setDayEnd((prev) => (prev === next ? prev : next));
    };
    const onVisible = () => {
      if (!document.hidden) check();
    };
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return dayEnd;
}
