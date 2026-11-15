'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_WEEK_START, localeWeekStart } from '@/lib/weekdays';

const noop = () => () => {};

/** The device's first day of the week (0 = Sunday). The static HTML uses the default, then the locale's */
export function useWeekStart(): number {
  return useSyncExternalStore(noop, () => localeWeekStart(), () => DEFAULT_WEEK_START);
}
