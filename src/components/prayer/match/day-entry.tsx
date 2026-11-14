'use client';

import Card from '@/components/ui/card';
import { PRAYER_NAMES, TIME_LABELS, type PrayerName } from '@/types/prayer';

/** One timetable row as typed: a date and HH:MM (or '') per prayer */
export interface DayDraft {
  iso: string;
  times: Record<PrayerName, string>;
}

export const emptyTimes = (): Record<PrayerName, string> => ({ fajr: '', dhuhr: '', asr: '', maghrib: '', isha: '' });

const inputClass =
  'min-h-11 rounded-xl border border-foreground/10 bg-cream px-3 text-base font-medium tabular-nums text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20';

/** The card for one date: the date, then the five start times */
export default function DayEntry({
  index,
  draft,
  onChange,
  onRemove,
}: {
  index: number;
  draft: DayDraft;
  onChange: (next: DayDraft) => void;
  onRemove?: () => void;
}) {
  const dateId = `match-date-${index}`;
  return (
    <Card className="p-4">
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
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
