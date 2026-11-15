'use client';

import Link from '@/components/app-link';
import { ADHKAR_SETS, nowHref, setForNow } from '@/components/adhkar/sets';
import { useAdhkarDeck } from '@/components/adhkar/use-deck';
import type { PrayerName } from '@/types/prayer';

export interface AdhkarNowProps {
  /** From currentWindow(): morning (Fajr to sunrise), evening (Asr to Maghrib) */
  window: 'morning' | 'evening' | null;
  /** The prayer whose time has entered, for its after-prayer adhkar */
  afterPrayer: PrayerName | null;
}

/**
 * Slot (all-in-one spec 3.4) on /prayer: one chip for the adhkar that fit now
 * (spec 2.7). Null when nothing fits, or when that set's deck hasn't shipped.
 */
export function AdhkarNow({ window, afterPrayer }: AdhkarNowProps) {
  const choice = setForNow(window, afterPrayer);
  const load = useAdhkarDeck(choice ? ADHKAR_SETS[choice.set].deck : null);
  if (!choice || load.status !== 'ready' || !load.items.length) return null;
  return (
    <Link
      href={nowHref(choice.set)}
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-card px-4 py-3 hover:bg-foreground/[0.02]"
      data-adhkar-now-chip={choice.set}
    >
      <span className="text-sm font-semibold text-foreground">{choice.label}</span>
      <span className="text-xs font-semibold text-teal">Say them now</span>
    </Link>
  );
}

export default AdhkarNow;
