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

/**
 * The one chip (spec 2.1: at most one contextual chip on /prayer). When two sets
 * fit (after Fajr: that prayer's adhkar and the morning set), the second is a
 * quiet second line inside the same chip. No DOM at all until the first set's
 * deck has loaded with something to say.
 */
function Chip({ choice, also }: { choice: NowChoice; also?: NowChoice }) {
  const set = ADHKAR_SETS[choice.set];
  const alsoSet = ADHKAR_SETS[(also ?? choice).set];
  const load = useAdhkarDeck(set.deck);
  const alsoLoad = useAdhkarDeck(alsoSet.deck);
  if (load.status !== 'ready' || !stepsFor(set, load.items).length) return null;
  const showAlso = !!also && alsoLoad.status === 'ready' && stepsFor(alsoSet, alsoLoad.items).length > 0;
  return (
    <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card" data-adhkar-now>
      <Link
        href={nowHref(choice.set)}
        className="flex min-h-12 items-center justify-between gap-3 px-4 py-3 hover:bg-foreground/[0.02]"
        data-adhkar-now-chip={choice.set}
      >
        <span className="text-sm font-semibold text-foreground">{choice.label}</span>
        <span className="text-xs font-semibold text-teal">Say them now</span>
      </Link>
      {showAlso && (
        <Link
          href={nowHref(also.set)}
          className="flex min-h-11 items-center justify-between gap-3 border-t border-foreground/10 px-4 py-2 text-xs hover:bg-foreground/[0.02]"
          data-adhkar-now-chip={also.set}
        >
          <span className="text-muted">{also.label} too</span>
          <span className="font-semibold text-teal">Open</span>
        </Link>
      )}
    </div>
  );
}

/**
 * Slot (all-in-one spec 3.4) on /prayer: one chip for the adhkar that fit now
 * (spec 2.7): after the prayer that has entered, and the morning or evening set
 * in its window. Renders nothing when none fits or the deck hasn't shipped.
 */
export function AdhkarNow({ window, afterPrayer }: AdhkarNowProps) {
  const choices = setsForNow(window, afterPrayer);
  if (!choices.length) return null;
  return <Chip key={choices.map((c) => c.set).join('+')} choice={choices[0]} also={choices[1]} />;
}

export default AdhkarNow;
