'use client';

import Link from '@/components/app-link';
import { ADHKAR_SETS, nowHref, setsForNow, stepsFor, type NowChoice } from '@/components/adhkar/sets';
import { useAdhkarDeck } from '@/components/adhkar/use-deck';
import type { PrayerName } from '@/types/prayer';

export interface AdhkarNowProps {
  /** From currentWindow(): morning (Fajr to sunrise), evening (Asr to Maghrib) */
  window: 'morning' | 'evening' | null;
  /** The prayer whose time has entered, for its after-prayer adhkar */
  afterPrayer: PrayerName | null;
}

/** One chip; no DOM at all until its deck has loaded with something to say */
function Chip({ choice }: { choice: NowChoice }) {
  const set = ADHKAR_SETS[choice.set];
  const load = useAdhkarDeck(set.deck);
  if (load.status !== 'ready' || !stepsFor(set, load.items).length) return null;
  return (
    <Link
      href={nowHref(choice.set)}
      className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-foreground/10 bg-card px-4 py-3 hover:bg-foreground/[0.02] [&+&]:mt-2"
      data-adhkar-now-chip={choice.set}
    >
      <span className="text-sm font-semibold text-foreground">{choice.label}</span>
      <span className="text-xs font-semibold text-teal">Say them now</span>
    </Link>
  );
}

/**
 * Slot (all-in-one spec 3.4) on /prayer: a chip for each set of adhkar that fits
 * now (spec 2.7): after the prayer that has entered, and the morning or evening
 * set in its window. Renders nothing when none fits or the deck hasn't shipped.
 */
export function AdhkarNow({ window, afterPrayer }: AdhkarNowProps) {
  const choices = setsForNow(window, afterPrayer);
  if (!choices.length) return null;
  return (
    <>
      {choices.map((c) => (
        <Chip key={c.set} choice={c} />
      ))}
    </>
  );
}

export default AdhkarNow;
