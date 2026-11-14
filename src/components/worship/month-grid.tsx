'use client';

import { ChevronLeftIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { dayTally, isPaused, type PrayerLog } from '@/lib/worship/log';
import type { Pause } from '@/stores/worship-store';
import { TRACKER_COPY } from './copy';
import { dayLabel, daysInMonth, monthLabel, mondayColumn, shiftMonth } from './dates';
import DayDots from './day-dots';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** A month of days, each with its five dots; past days and today open the day to fill in */
export default function MonthGrid({
  month,
  today,
  log,
  pauses,
  onMonth,
  onDay,
  hint,
}: {
  /** YYYY-MM */
  month: string;
  today: string;
  log: PrayerLog;
  pauses: readonly Pause[];
  onMonth: (month: string) => void;
  onDay: (iso: string) => void;
  /** A line between the month name and the days, read before the grid is used */
  hint?: React.ReactNode;
}) {
  const n = daysInMonth(month);
  const lead = mondayColumn(`${month}-01`);
  const isCurrent = month >= today.slice(0, 7);

  return (
    <div data-month={month}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, -1))}
          aria-label={TRACKER_COPY.monthPrev}
          className="pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:text-foreground"
        >
          <ChevronLeftIcon size={18} />
        </button>
        <h3 className="text-sm font-semibold text-foreground" aria-live="polite">
          {monthLabel(month)}
        </h3>
        <button
          type="button"
          onClick={() => onMonth(shiftMonth(month, 1))}
          disabled={isCurrent}
          aria-label={TRACKER_COPY.monthNext}
          className={cn(
            '-mr-2 flex h-11 w-11 items-center justify-center rounded-full',
            isCurrent ? 'invisible' : 'pressable text-muted hover:text-foreground',
          )}
        >
          <ChevronLeftIcon size={18} className="rotate-180" />
        </button>
      </div>

      {hint}

      <div className="mt-2 grid grid-cols-7 gap-y-1 text-center" role="group" aria-label={monthLabel(month)}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className="pb-1 text-[11px] font-semibold text-muted" aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead-${i}`} aria-hidden />
        ))}
        {Array.from({ length: n }, (_, i) => {
          const iso = `${month}-${String(i + 1).padStart(2, '0')}`;
          const future = iso > today;
          const paused = isPaused(iso, pauses);
          const t = dayTally(log[iso]);
          const state = future ? '' : paused ? TRACKER_COPY.legendPaused : TRACKER_COPY.dayLogged(t.prayed + t.missed);
          return (
            <button
              key={iso}
              type="button"
              disabled={future}
              onClick={() => onDay(iso)}
              aria-label={state ? `${dayLabel(iso)}, ${state}` : dayLabel(iso)}
              aria-current={iso === today ? 'date' : undefined}
              data-day={iso}
              className={cn(
                'flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl py-1',
                future ? 'cursor-default opacity-40' : 'pressable hover:bg-foreground/[0.03]',
                iso === today && 'bg-teal/[0.07]',
              )}
            >
              <span className={cn('text-xs tabular-nums', iso === today ? 'font-bold text-teal' : 'text-foreground')}>{i + 1}</span>
              <span className="flex h-[5px] items-center" aria-hidden>
                {!future && <DayDots day={log[iso]} paused={paused} />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
