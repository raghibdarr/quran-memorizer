'use client';

import Card from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { methodInfo, ASR_LABELS } from '@/lib/prayer/methods';
import { PRAYER_NAMES, TIME_LABELS, type PrayerCalcSettings, type PrayerName } from '@/types/prayer';
import type { MatchCell } from '@/lib/prayer/match';

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

/**
 * Before and after against the entered times, one block per date. "Now" is the
 * current settings, "Match" the fitted ones; a number beside a time is how many
 * minutes it sits from the mosque's.
 */
export function CompareTable({
  cells,
  before,
}: {
  cells: MatchCell[];
  before: Record<string, Record<PrayerName, number | null>>;
}) {
  const dates = [...new Set(cells.map((c) => c.iso))];
  return (
    <div className="space-y-4" data-match-table>
      {dates.map((iso) => (
        <Card key={iso} className="p-4">
          <p className="text-sm font-semibold text-foreground">{dateLabel(iso)}</p>
          <table className="mt-2 w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1.5 font-medium">Prayer</th>
                <th className="py-1.5 text-right font-medium">Mosque</th>
                <th className="py-1.5 text-right font-medium">Now</th>
                <th className="py-1.5 text-right font-medium">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {cells
                .filter((c) => c.iso === iso)
                .map((c) => {
                  const was = before[iso]?.[c.prayer] ?? null;
                  return (
                    <tr key={c.prayer} data-prayer={c.prayer}>
                      <td className="py-2 text-foreground">{TIME_LABELS[c.prayer]}</td>
                      <td className="py-2 text-right font-semibold text-foreground">{hm(c.entered)}</td>
                      <td className="py-2 text-right text-muted">
                        <TimeWithGap minutes={was} entered={c.entered} />
                      </td>
                      <td className="py-2 text-right font-semibold text-teal">
                        <TimeWithGap minutes={c.after} entered={c.entered} />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}

function TimeWithGap({ minutes, entered }: { minutes: number | null; entered: number }) {
  if (minutes === null) return <>–</>;
  let gap = (minutes - entered) % 1440;
  if (gap > 720) gap -= 1440;
  if (gap < -720) gap += 1440;
  return (
    <span className="inline-flex items-baseline justify-end gap-1">
      {hm(minutes)}
      <span
        className={cn('w-7 text-left text-[11px] font-medium', gap === 0 ? 'text-transparent' : 'text-gold-deep')}
        aria-label={gap === 0 ? 'matches' : `${Math.abs(gap)} minutes ${gap > 0 ? 'later' : 'earlier'}`}
      >
        {gap === 0 ? '·' : signed(gap)}
      </span>
    </span>
  );
}
