'use client';

import Card from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { methodInfo, ASR_LABELS } from '@/lib/prayer/methods';
import { PRAYER_NAMES, TIME_LABELS, type PrayerCalcSettings, type PrayerName } from '@/types/prayer';

const HIGH_LAT_LABELS = {
  auto: 'Automatic',
  middleofthenight: 'Middle of the night',
  seventhofthenight: 'Seventh of the night',
  twilightangle: 'Twilight angle',
} as const;

/** 307 → "05:07" (minutes after midnight, place time) */
export function hm(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return '–';
  const t = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

function adjustmentsLine(calc: PrayerCalcSettings): string {
  const parts = PRAYER_NAMES.filter((p) => calc.offsets[p] !== 0).map((p) => `${TIME_LABELS[p]} ${signed(calc.offsets[p])} min`);
  return parts.length ? parts.join(' · ') : 'None';
}

function anglesLine(calc: PrayerCalcSettings): string | null {
  const a = calc.customAngles;
  if (calc.method !== 'custom' || !a) return null;
  const isha = a.ishaInterval ? `Isha ${a.ishaInterval} min after Maghrib` : `Isha ${a.isha.toFixed(1)}°`;
  return `Fajr ${a.fajr.toFixed(1)}° · ${isha}`;
}

/** What the fit chose, in plain rows */
export function FitSummary({ calc }: { calc: PrayerCalcSettings }) {
  const angles = anglesLine(calc);
  const rows: [string, string][] = [
    ['Method', methodInfo(calc.method).label],
    ...(angles ? ([['Angles', angles]] as [string, string][]) : []),
    ['Asr', ASR_LABELS[calc.madhab]],
    ...(calc.highLatRule !== 'auto' ? ([['High latitude', HIGH_LAT_LABELS[calc.highLatRule]]] as [string, string][]) : []),
    ['Adjustments', adjustmentsLine(calc)],
  ];
  return (
    <dl className="space-y-2.5" data-match-summary>
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[6.5rem_1fr] gap-3 text-sm">
          <dt className="text-muted">{k}</dt>
          <dd className="font-medium text-foreground">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One date in the before-and-after table: what was typed, what the current and fitted settings give */
export interface CompareDay {
  iso: string;
  entered: Partial<Record<PrayerName, number>>;
  before: Record<PrayerName, number | null>;
  after: Record<PrayerName, number | null>;
}

/**
 * Before and after against the entered times, one block per date, all five
 * prayers (Apply changes every one, typed or not). "Now" is the current
 * settings, "Match" the fitted ones; a small number beside a time is how many
 * minutes it sits from the mosque's.
 */
export function CompareTable({ days }: { days: CompareDay[] }) {
  const anyGap = days.some((d) =>
    PRAYER_NAMES.some((p) => {
      const e = d.entered[p];
      return e !== undefined && [d.before[p], d.after[p]].some((t) => t !== null && gapOf(t, e) !== 0);
    }),
  );
  return (
    <div className="space-y-4" data-match-table>
      {days.map((d) => (
        <Card key={d.iso} className="p-4">
          <p className="text-sm font-semibold text-foreground">{dateLabel(d.iso)}</p>
          <table className="mt-2 w-full text-sm tabular-nums">
            <colgroup>
              <col />
              <col className="sm:w-28" />
              <col className="sm:w-28" />
              <col className="sm:w-28" />
            </colgroup>
            <thead>
              <tr className="text-left text-xs text-muted">
                <th scope="col" className="py-1.5 font-medium">Prayer</th>
                <th scope="col" className="py-1.5 pl-2 text-right font-medium">Mosque</th>
                {/* pr-8 sits the header over the digits, past the gap slot (w-7 + gap-1) */}
                <th scope="col" className="py-1.5 pr-8 pl-3 text-right font-medium">Now</th>
                <th scope="col" className="py-1.5 pr-8 pl-2 text-right font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {PRAYER_NAMES.map((p) => {
                const entered = d.entered[p] ?? null;
                return (
                  <tr key={p} data-prayer={p} data-entered={entered === null ? undefined : ''}>
                    <th scope="row" className={cn('py-2 text-left font-normal', entered === null ? 'text-muted' : 'text-foreground')}>
                      {TIME_LABELS[p]}
                    </th>
                    <td className="py-2 pl-2 text-right font-semibold text-foreground">
                      {entered === null ? (
                        <>
                          <span aria-hidden className="font-normal text-muted">–</span>
                          <span className="sr-only">not entered</span>
                        </>
                      ) : (
                        hm(entered)
                      )}
                    </td>
                    <td className="py-2 pl-3 text-right text-muted">
                      <TimeWithGap minutes={d.before[p]} entered={entered} />
                    </td>
                    <td className="py-2 pl-2 text-right font-semibold text-teal">
                      <TimeWithGap minutes={d.after[p]} entered={entered} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
      {anyGap && (
        <p className="px-1 text-xs leading-relaxed text-muted" data-match-legend>
          Small numbers are minutes before (−) or after (+) the mosque’s time.
        </p>
      )}
    </div>
  );
}

/** time minus entered on a 24-hour clock, in minutes */
function gapOf(minutes: number, entered: number): number {
  let gap = (minutes - entered) % 1440;
  if (gap > 720) gap -= 1440;
  if (gap < -720) gap += 1440;
  return gap;
}

function TimeWithGap({ minutes, entered }: { minutes: number | null; entered: number | null }) {
  if (minutes === null) {
    return (
      <span className="inline-flex items-baseline justify-end gap-1">
        –<span aria-hidden className="w-7" />
      </span>
    );
  }
  const gap = entered === null ? 0 : gapOf(minutes, entered);
  const quiet = entered === null || gap === 0;
  return (
    <span className="inline-flex items-baseline justify-end gap-1">
      {hm(minutes)}
      <span aria-hidden className={cn('w-7 text-left text-xs font-medium', quiet ? 'text-transparent' : 'text-gold-deep')}>
        {quiet ? '·' : signed(gap)}
      </span>
      {/* aria-label on a plain span is ignored by most screen readers: say it in text */}
      {entered !== null && (
        <span className="sr-only">
          {gap === 0 ? ', matches' : `, ${Math.abs(gap)} ${Math.abs(gap) === 1 ? 'minute' : 'minutes'} ${gap > 0 ? 'later' : 'earlier'}`}
        </span>
      )}
    </span>
  );
}
