'use client';

import Link from '@/components/app-link';
import { CalendarIcon } from '@/components/ui/icons';
import { formatHijri, toHijri } from '@/lib/hijri/convert';
import { useHijriToday } from '@/components/calendar/use-hijri-today';

/**
 * Slot (all-in-one spec 3.4) on /prayer: one line with today's expected Hijri
 * date, the user's offset applied. Tapping opens /calendar. Owner: hijri-ramadan.
 */
export function HijriLine({ now }: { now: number }) {
  const { today, offset } = useHijriToday(now);
  return (
    <Link
      href="/calendar"
      className="pressable -mx-1 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm text-muted hover:text-foreground"
      data-hijri-line
    >
      <CalendarIcon size={15} className="shrink-0 text-teal" />
      <span>
        <span className="font-semibold text-foreground">{formatHijri(toHijri(today, offset))}</span>
        <span> · expected</span>
      </span>
    </Link>
  );
}

export default HijriLine;
