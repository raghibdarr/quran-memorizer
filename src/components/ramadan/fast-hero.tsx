'use client';

import Link from '@/components/app-link';
import Card from '@/components/ui/card';
import { formatCivil } from '@/lib/hijri/calendar';
import {
  formatClock,
  fastTimesToShow,
  formatCountdown,
  momentLabel,
  nextFastMoment,
  seasonLine,
  type RamadanSeason,
} from '@/lib/worship/ramadan';
import type { FastDay } from './use-fast-times';

/**
 * The top of /ramadan: where the season is, and (with a place set) a countdown
 * to suhoor end or iftar with both of today's times under it.
 */
export default function FastHero({
  season,
  times,
  hasPlace,
  imsakMin,
  now,
  countdown,
}: {
  season: RamadanSeason;
  times: FastDay | null;
  hasPlace: boolean;
  imsakMin: number;
  now: number;
  /** Count down to suhoor end or iftar (in season, or on a day marked as a fast); else just today's times */
  countdown: boolean;
}) {
  const moment = times && countdown ? nextFastMoment(now, times.today, times.tomorrow) : null;
  const shown = times ? fastTimesToShow(now, times.today, times.tomorrow) : null;
  const heading = season.inRamadan ? `${seasonLine(season)} · expected` : `Ramadan ${season.hijriYear}`;

  return (
    <section data-fast-hero>
      <Card variant="tactile" className="p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep">{heading}</p>
        {!season.inRamadan && (
          <p className="mt-1 text-sm text-muted">
            Expected to begin on {formatCivil(season.start)}
            {season.daysUntilStart > 1 ? `, in ${season.daysUntilStart} days` : ''}.
          </p>
        )}

        {!hasPlace ? (
          <div className="mt-3">
            <p className="text-sm text-foreground">Set your place to see suhoor and iftar times. They are worked out on your phone.</p>
            <Link
              href="/prayer/setup"
              className="tactile-btn mt-3 flex min-h-12 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal"
            >
              Set your place
            </Link>
          </div>
        ) : times && shown ? (
          <>
            {moment ? (
              <div className="mt-2" data-countdown={moment.kind}>
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {momentLabel(moment.kind)} {formatClock(moment.at, times.tz)}
                </p>
                <p className="text-sm font-semibold text-teal tabular-nums">{formatCountdown(moment.at, now)}</p>
              </div>
            ) : countdown ? (
              <p className="mt-2 text-sm text-muted">Fajr or Maghrib can&apos;t be worked out for this place today.</p>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {shown.day === 'tomorrow' ? 'Tomorrow’s times' : 'Today’s times'}
                {season.inRamadan ? ':' : ', for a voluntary fast:'}
              </p>
            )}
            {moment && shown.day === 'tomorrow' && (
              <p className="mt-4 border-t border-foreground/10 pt-3 text-xs font-semibold text-muted" data-times-day="tomorrow">Tomorrow</p>
            )}
            <dl
              className={`grid grid-cols-2 gap-3 ${moment ? (shown.day === 'tomorrow' ? 'mt-1' : 'mt-4 border-t border-foreground/10 pt-3') : 'mt-2'}`}
            >
              <div>
                <dt className="text-xs text-muted">Suhoor ends</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">
                  {shown.times.suhoorEnd !== null ? formatClock(shown.times.suhoorEnd, times.tz) : '–'}
                </dd>
                <dd className="text-[11px] leading-snug text-muted">
                  {imsakMin > 0 && shown.times.fajr !== null
                    ? `${imsakMin} min before Fajr (${formatClock(shown.times.fajr, times.tz)}), as a precaution`
                    : 'At Fajr'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Iftar</dt>
                <dd className="text-lg font-semibold tabular-nums text-foreground">
                  {shown.times.iftar !== null ? formatClock(shown.times.iftar, times.tz) : '–'}
                </dd>
                <dd className="text-[11px] leading-snug text-muted">At Maghrib</dd>
              </div>
            </dl>
          </>
        ) : (
          <div className="mt-3 h-20 animate-pulse rounded-xl bg-foreground/5" aria-hidden />
        )}
      </Card>
    </section>
  );
}
