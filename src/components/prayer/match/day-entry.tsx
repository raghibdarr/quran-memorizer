'use client';

import Card from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { PRAYER_NAMES, TIME_LABELS, type PrayerName } from '@/types/prayer';

/** One timetable row as typed: a date and HH:MM (or '') per prayer */
export interface DayDraft {
  iso: string;
  times: Record<PrayerName, string>;
}

export const emptyTimes = (): Record<PrayerName, string> => ({ fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' });

// The app's dark theme is the .dark class, not the media query, so the native
// picker icons and popups follow it through [.dark_&]. appearance-none lets iOS
// keep the height, radius and background.
const inputClass =
  'min-h-11 appearance-none rounded-xl border border-foreground/10 bg-cream px-3 text-base font-medium tabular-nums text-foreground [color-scheme:light] [.dark_&]:[color-scheme:dark] [&::-webkit-calendar-picker-indicator]:opacity-50 hover:[&::-webkit-calendar-picker-indicator]:opacity-80 focus:border-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-teal/50 aria-invalid:border-miss/50';

/** The card for one date: the date, then the five start times */
export default function DayEntry({
  index,
  draft,
  onChange,
  onRemove,
  errorId,
}: {
  index: number;
  draft: DayDraft;
  onChange: (next: DayDraft) => void;
  onRemove?: () => void;
  /** Set when this date's times are the problem: the id of the message that says why */
  errorId?: string;
}) {
  const dateId = `match-date-${index}`;
  const invalid = errorId ? { 'aria-invalid': true, 'aria-describedby': errorId } : {};
  return (
    <Card className={cn('p-4', errorId && 'ring-2 ring-miss/40')}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={dateId} className="text-sm font-semibold text-foreground">
          {index === 0 ? 'Date' : 'Second date'}
        </label>
        {onRemove && (
          <button type="button" onClick={onRemove} className="min-h-11 px-2 text-xs font-semibold text-muted hover:text-foreground">
            Remove
          </button>
        )}
      </div>
      <input
        id={dateId}
        type="date"
        value={draft.iso}
        onChange={(e) => onChange({ ...draft, iso: e.target.value })}
        className={`${inputClass} mt-2 w-full`}
        data-match-date={index}
        {...invalid}
      />
      <ul className="mt-3 divide-y divide-foreground/5">
        {PRAYER_NAMES.map((p) => {
          const id = `match-${index}-${p}`;
          return (
            <li key={p} className="flex items-center justify-between gap-3 py-1.5">
              <label htmlFor={id} className="text-sm text-foreground">
                {TIME_LABELS[p]}
              </label>
              <input
                id={id}
                type="time"
                value={draft.times[p]}
                onChange={(e) => onChange({ ...draft, times: { ...draft.times, [p]: e.target.value } })}
                className={`${inputClass} w-32 text-right`}
                aria-label={`${TIME_LABELS[p]} start time`}
                data-match-time={`${index}-${p}`}
                {...invalid}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
