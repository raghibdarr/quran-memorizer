'use client';

import Link from '@/components/app-link';
import { MoonIcon } from '@/components/ui/icons';
import { formatCivil } from '@/lib/hijri/calendar';
import { formatClock, formatCountdown, momentLabel, nextFastMoment, ramadanSeason, seasonLine } from '@/lib/worship/ramadan';
import { usePrayerStore } from '@/stores/prayer-store';
import { useHijriToday } from '@/components/calendar/use-hijri-today';
import { useNow } from '@/components/calendar/use-now';
import { useFastTimes } from '@/components/ramadan/use-fast-times';

/**
 * Slot (all-in-one spec 3.4) on /prayer: from 7 days before the expected start
 * of Ramadan through the month (or whenever Ramadan mode is on), one chip to
 * /ramadan with the next of suhoor end or iftar. Null otherwise. Owner: hijri-ramadan.
 */
export function RamadanBanner() {
  const now = useNow(30_000);
  const { today, offset } = useHijriToday(now);
  const mode = usePrayerStore((s) => s.ramadanMode);
  const season = ramadanSeason(today, offset, mode);
  const times = useFastTimes(season.bannerVisible && season.active, today);
  if (!season.bannerVisible) return null;

  const moment = times ? nextFastMoment(now, times.today, times.tomorrow) : null;
  const detail = moment && times
    ? `${momentLabel(moment.kind)} ${formatClock(moment.at, times.tz)} · ${formatCountdown(moment.at, now)}`
    : !season.inRamadan && season.daysUntilStart > 0 && season.daysUntilStart <= 7
      ? `Expected ${formatCivil(season.start)}`
      : 'Suhoor, iftar and your fasts';

  return (
    <Link
      href="/ramadan"
      className="pressable flex min-h-14 items-center gap-3 rounded-2xl border border-gold/30 bg-gold/10 px-4 py-3"
      data-ramadan-banner
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold-deep">
        <MoonIcon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">{seasonLine(season)}</span>
        <span className="block truncate text-xs text-muted tabular-nums">{detail}</span>
      </span>
      <span aria-hidden className="text-gold-deep">›</span>
    </Link>
  );
}

export default RamadanBanner;
