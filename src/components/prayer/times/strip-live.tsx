'use client';

import Link from '@/components/app-link';
import { PrayerIcon } from '@/components/ui/icons';
import { usePrayerStore } from '@/stores/prayer-store';
import { prefers12h, useModelSettings, useNow, usePlace, usePrayerModule } from './use-prayer-model';

/**
 * The live Home strip, loaded by HomePrayerStrip only once a place exists:
 * stores, engine and all stay out of Home's first load.
 */
export default function PrayerStripLive() {
  const place = usePlace();
  const on = usePrayerStore((s) => s.homeStrip);
  const show = !!place && on;
  const mod = usePrayerModule(show);
  const settings = useModelSettings();
  const now = useNow(15_000, show);

  if (!show) return null;
  const line = mod ? mod.stripLine(place, settings, now, prefers12h()) : null;

  return (
    <Link
      href="/prayer"
      className="pressable flex min-h-11 items-center gap-2.5 rounded-2xl border border-foreground/10 bg-card px-4 py-2 text-sm"
      aria-label={line ? `Next prayer: ${line.label} at ${line.time}${line.estimated ? ', estimated' : ''}, ${line.until}` : 'Prayer times'}
      data-home-prayer-strip
    >
      <PrayerIcon size={16} className="shrink-0 text-teal" />
      {line ? (
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-foreground">{line.label}</span>{' '}
          {line.estimated && <span className="text-[11px] font-semibold text-gold-deep" data-estimated>est. </span>}
          <span className="font-semibold tabular-nums text-foreground">{line.time}</span>
          <span className="text-muted"> · {line.until}</span>
        </span>
      ) : (
        // Holds the line's height while the times load (a moment, from the app's own files)
        <span className="min-w-0 flex-1 truncate text-muted">{mod ? 'Prayer times' : ' '}</span>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
        <polyline points="9 18 15 12 9 6" />
      </svg>
    </Link>
  );
}

