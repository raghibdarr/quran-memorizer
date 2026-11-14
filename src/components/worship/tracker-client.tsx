'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import { addDaysIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { isPaused, makeUpOwed, missedEntries, openPause, rangeTally, resumeFor } from '@/lib/worship/log';
import { currentRun } from '@/lib/worship/streak';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { useWorshipStore } from '@/stores/worship-store';
import { PRAYER_NAMES, TIME_LABELS, type PrayerName } from '@/types/prayer';
import { TRACKER_COPY } from './copy';
import { dayLabel, isoInZone, longDayLabel } from './dates';
import DayDots from './day-dots';
import DaySheet from './day-sheet';
import MonthGrid from './month-grid';
import ScreenHeader from './screen-header';
import TrackerTick from './tracker-tick';
import { useNow } from './use-now';

type Engine = typeof import('@/lib/prayer/engine');

interface Row {
  prayer: PrayerName;
  startMs: number | null;
  endMs: number | null;
}

const MAX_LISTED = 12;

/**
 * /prayer/tracker (spec 2.2, 2.7): today's five ticks, the last seven days, a
 * month of dots, make-up prayers and Pause. Dots and lists only: no red, no
 * message about a run ending, no notifications.
 */
export default function TrackerClient() {
  const now = useNow();
  const place = usePlaceStore((s) => s.place);
  const prayerState = usePrayerStore();
  const prayers = useWorshipStore((s) => s.prayers);
  const pauses = useWorshipStore((s) => s.pauses);
  const madeUp = useWorshipStore((s) => s.madeUp.prayers);
  const { startPause, endPause, removePause, addMadeUp } = useWorshipStore.getState();

  // adhan loads only on Prayer screens, and only once a place exists (spec 10)
  const [engine, setEngine] = useState<Engine | null>(null);
  useEffect(() => {
    if (!place || engine) return;
    let live = true;
    import('@/lib/prayer/engine').then((m) => live && setEngine(m));
    return () => {
      live = false;
    };
  }, [place, engine]);

  const today = isoInZone(now, place?.tz);
  const settings = useMemo(() => calcSettingsOf(prayerState), [prayerState]);

  // The prayer day on screen: after midnight Isha's time is still yesterday's
  const { rowsIso, rows } = useMemo((): { rowsIso: string; rows: Row[] | null } => {
    if (!place) return { rowsIso: today, rows: PRAYER_NAMES.map((p) => ({ prayer: p, startMs: null, endMs: null })) };
    if (!engine) return { rowsIso: today, rows: null };
    try {
      const iso = engine.currentPrayer(place, settings, now)?.iso ?? today;
      const all = engine.prayerRows(place, iso, settings);
      return {
        rowsIso: iso,
        rows: PRAYER_NAMES.map((p) => {
          const r = all.find((x) => x.name === p);
          return { prayer: p, startMs: r?.startMs ?? null, endMs: r?.endMs ?? null };
        }),
      };
    } catch {
      return { rowsIso: today, rows: PRAYER_NAMES.map((p) => ({ prayer: p, startMs: null, endMs: null })) };
    }
  }, [place, engine, settings, now, today]);

  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [dayOpen, setDayOpen] = useState(false);
  const [dayIso, setDayIso] = useState<string | null>(null);

  const week = rangeTally(prayers, pauses, addDaysIso(today, -6), today);
  const run = currentRun(prayers, pauses, today);
  const paused = openPause(pauses);
  const missed = missedEntries(prayers, pauses);
  const owed = makeUpOwed(prayers, pauses, madeUp);
  const showMakeUp = missed.length > 0 || madeUp > 0;

  const resume = () => {
    if (!paused) return;
    const r = resumeFor(paused, today);
    if (r.remove) removePause(paused.id);
    else endPause(paused.id, r.to);
  };

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-tracker>
      <ScreenHeader title={TRACKER_COPY.title} back="/prayer" />

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        {paused && (
          <Card className="flex items-center justify-between gap-3 p-4">
            <div data-paused-since={paused.from}>
              <p className="text-sm font-semibold text-foreground">{TRACKER_COPY.pausedSince(longDayLabel(paused.from))}</p>
              <p className="mt-0.5 text-xs text-muted">{TRACKER_COPY.pausedHint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                resume();
              }}
              className="tactile-chip min-h-11 shrink-0 rounded-full bg-teal px-4 text-sm font-semibold text-on-teal"
            >
              {TRACKER_COPY.resume}
            </button>
          </Card>
        )}

        <Card className="p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-bold text-foreground">{rowsIso === today ? TRACKER_COPY.todayHeading : dayLabel(rowsIso)}</h2>
            {rowsIso !== today || !place ? null : <span className="text-xs text-muted">{dayLabel(today)}</span>}
          </div>
          <p className="mt-0.5 text-xs text-muted">{TRACKER_COPY.todayHint}</p>
          {rows ? (
            <ul className="mt-2 divide-y divide-foreground/5" data-today={rowsIso}>
              {rows.map((r) => (
                <li key={r.prayer} className="flex items-center justify-between gap-3 py-1">
                  <span className="flex items-baseline gap-3">
                    <span className="w-16 text-sm font-semibold text-foreground">{TIME_LABELS[r.prayer]}</span>
                    {engine && place && r.startMs !== null && (
                      <span className="text-sm text-muted tabular-nums">{engine.formatTime(r.startMs, place.tz)}</span>
                    )}
                  </span>
                  <TrackerTick iso={rowsIso} prayer={r.prayer} startMs={r.startMs} endMs={r.endMs} />
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-2 h-[13.75rem]" aria-hidden />
          )}
          {!place && (
            <p className="mt-2 text-xs text-muted">
              {TRACKER_COPY.noPlaceHint}{' '}
              <Link href="/prayer/setup" className="font-semibold text-teal">
                {TRACKER_COPY.setPlace}
              </Link>
            </p>
          )}
        </Card>

        <Card className="p-4">
          <h2 className="text-sm font-semibold text-foreground">{TRACKER_COPY.weekHeading}</h2>
          <p className="mt-0.5 text-xs text-muted" data-week={`${week.prayed}:${week.ontime}`}>
            {week.prayed + week.missed === 0
              ? TRACKER_COPY.weekNone
              : `${TRACKER_COPY.weekPrayed(week.prayed)} · ${TRACKER_COPY.weekOnTime(week.ontime)}`}
          </p>
          <ol className="mt-3 grid grid-cols-7 gap-1 text-center">
            {Array.from({ length: 7 }, (_, i) => {
              const iso = addDaysIso(today, i - 6);
              return (
                <li key={iso} className="flex flex-col items-center gap-1.5">
                  <span className={iso === today ? 'text-[11px] font-bold text-teal' : 'text-[11px] text-muted'}>
                    {dayLabel(iso).slice(0, 2)}
                  </span>
                  <DayDots day={prayers[iso]} paused={isPaused(iso, pauses)} />
                </li>
              );
            })}
          </ol>
          {run >= 2 && <p className="mt-3 text-xs font-semibold text-teal">{TRACKER_COPY.run(run)}</p>}
        </Card>

        <Card className="p-4">
          <MonthGrid
            month={month}
            today={today}
            log={prayers}
            pauses={pauses}
            onMonth={setMonth}
            onDay={(iso) => {
              setDayIso(iso);
              setDayOpen(true);
            }}
          />
          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>{TRACKER_COPY.monthHint}</span>
            <span className="flex items-center gap-3" aria-hidden>
              <Legend className="bg-teal" label={TRACKER_COPY.legendOnTime} />
              <Legend className="bg-gold" label={TRACKER_COPY.legendLate} />
            </span>
          </div>
        </Card>

        {showMakeUp && (
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-foreground">{TRACKER_COPY.makeUpHeading}</h2>
            <p className="mt-0.5 text-xs text-muted">{TRACKER_COPY.makeUpHint}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-base font-bold text-foreground tabular-nums" data-owed={owed}>
                {owed > 0 ? TRACKER_COPY.makeUpCount(owed) : TRACKER_COPY.makeUpDone}
              </p>
              <span className="flex items-center gap-1">
                {madeUp > 0 && (
                  <button
                    type="button"
                    onClick={() => addMadeUp('prayers', -1)}
                    className="min-h-11 px-3 text-sm font-semibold text-muted hover:text-foreground"
                  >
                    {TRACKER_COPY.undo}
                  </button>
                )}
                {owed > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      haptic.success();
                      addMadeUp('prayers', 1);
                    }}
                    className="pressable min-h-11 rounded-full bg-teal px-4 text-sm font-semibold text-on-teal"
                  >
                    {TRACKER_COPY.madeOneUp}
                  </button>
                )}
              </span>
            </div>
            {missed.length > 0 && (
              <details className="mt-2 text-xs text-muted">
                <summary className="flex min-h-11 cursor-pointer items-center">{TRACKER_COPY.fromDays}</summary>
                <ul className="space-y-1 pb-1">
                  {missed.slice(0, MAX_LISTED).map((m) => (
                    <li key={`${m.iso}:${m.prayer}`} className="tabular-nums">
                      {TIME_LABELS[m.prayer]} · {dayLabel(m.iso)}
                    </li>
                  ))}
                  {missed.length > MAX_LISTED && <li>+{missed.length - MAX_LISTED}</li>}
                </ul>
              </details>
            )}
          </Card>
        )}

        {!paused && (
          <section className="flex items-center justify-between gap-3 px-1 py-2">
            <p className="text-xs text-muted">{TRACKER_COPY.pauseHint}</p>
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                startPause(today);
              }}
              data-pause
              className="pressable min-h-11 shrink-0 rounded-full border border-foreground/15 bg-card px-4 text-sm font-semibold text-foreground"
            >
              {TRACKER_COPY.pauseAction}
            </button>
          </section>
        )}
      </main>

      <DaySheet iso={dayIso} open={dayOpen} onClose={() => setDayOpen(false)} />
      <BottomNav />
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-[5px] w-[5px] rounded-full ${className}`} />
      {label}
    </span>
  );
}
