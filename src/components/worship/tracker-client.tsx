'use client';

import { WEEKDAY_LABELS, weekdayOfIso } from '@/lib/weekdays';
import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import { ChevronDownIcon } from '@/components/ui/icons';
import { addDaysIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { isPaused, makeUpOwed, missedEntries, openPause, rangeTally, resumeFor } from '@/lib/worship/log';
import { currentRun } from '@/lib/worship/streak';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { useWorshipStore } from '@/stores/worship-store';
import { PRAYER_NAMES, TIME_LABELS, type PrayerName } from '@/types/prayer';
import { MARK_LABELS, TRACKER_COPY } from './copy';
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
  // Counted from the prayer day on screen: between midnight and Fajr the day
  // before is still in progress (its Isha is current), not a gap in the run
  const run = currentRun(prayers, pauses, rowsIso);
  const paused = openPause(pauses);
  const missed = missedEntries(prayers, pauses);
  const owed = makeUpOwed(prayers, pauses, madeUp);
  const showMakeUp = missed.length > 0 || madeUp > 0;
  // The made-up count is a number, not a list, so it comes off the oldest
  // first: what is listed is what is still to make up (newest first)
  const toMakeUp = missed.slice(0, owed);
  const rowsPaused = isPaused(rowsIso, pauses);
  const pauseAhead = paused !== undefined && paused.from > today;
  // Taught until the first mark; after that the rows speak for themselves
  const firstVisit = Object.keys(prayers).length === 0;

  // In the day sheet, as on the rows, a prayer can't be logged before its time:
  // the prayer day on screen keeps its not-yet-begun prayers back, and a day
  // after it (the new date between midnight and Fajr) has not begun at all
  const notYet: PrayerName[] =
    !dayIso || !place || !rows
      ? []
      : dayIso > rowsIso
        ? [...PRAYER_NAMES]
        : dayIso === rowsIso
          ? rows.filter((r) => r.startMs !== null && now < r.startMs).map((r) => r.prayer)
          : [];

  // Pausing today would take today's marks out of the counts under the user's
  // feet, so with today already logged the pause starts tomorrow
  const pause = () => {
    const todayLogged = Object.keys(prayers[today] ?? {}).length > 0;
    startPause(todayLogged ? addDaysIso(today, 1) : today);
  };

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
              <p className="text-sm font-semibold text-foreground">
                {pauseAhead ? TRACKER_COPY.pausedFrom(longDayLabel(paused.from)) : TRACKER_COPY.pausedSince(longDayLabel(paused.from))}
              </p>
              <p className="mt-0.5 text-xs text-muted">{pauseAhead ? TRACKER_COPY.pausedFromHint : TRACKER_COPY.pausedHint}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                resume();
              }}
              className="pressable min-h-11 shrink-0 rounded-full bg-teal px-4 text-sm font-semibold text-on-teal"
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
          {(rowsPaused || firstVisit) && (
            <p className="mt-0.5 text-xs text-muted" data-today-hint>
              {rowsPaused ? TRACKER_COPY.dayPaused : TRACKER_COPY.todayHint}
            </p>
          )}
          {rows ? (
            <ul className="mt-2 divide-y divide-foreground/5" data-today={rowsIso}>
              {rows.map((r) => {
                const waiting = r.startMs !== null && now < r.startMs && !prayers[rowsIso]?.[r.prayer];
                return (
                  <li key={r.prayer} className="flex items-center justify-between gap-3 py-1">
                    {/* Shrinks and wraps at large text sizes so the tick stays on screen */}
                    <span className="flex min-w-0 flex-wrap items-baseline gap-x-3">
                      <span className="w-16 max-w-full text-sm font-semibold text-foreground">{TIME_LABELS[r.prayer]}</span>
                      {engine && place && r.startMs !== null && (
                        <span className="text-sm text-muted tabular-nums">{engine.formatTime(r.startMs, place.tz)}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {waiting && (
                        <span className="text-xs text-muted" aria-hidden data-not-yet-row={r.prayer}>
                          {TRACKER_COPY.notYet}
                        </span>
                      )}
                      <TrackerTick iso={rowsIso} prayer={r.prayer} startMs={r.startMs} endMs={r.endMs} />
                    </span>
                  </li>
                );
              })}
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
                    {WEEKDAY_LABELS[weekdayOfIso(iso)]}
                  </span>
                  <span className="flex h-2 items-center">
                    <DayDots day={prayers[iso]} paused={isPaused(iso, pauses)} size="md" />
                  </span>
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
            hint={<p className="text-center text-xs text-muted">{TRACKER_COPY.monthHint}</p>}
          />
          <ul className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] text-muted" data-legend>
            <Legend mark={<span className="block h-1.5 w-1.5 rounded-full bg-teal" />} label={TRACKER_COPY.legendOnTime} />
            <Legend mark={<span className="block h-1.5 w-1.5 rounded-full bg-gold" />} label={TRACKER_COPY.legendLate} />
            <Legend mark={<span className="block h-1.5 w-1.5 rounded-full border border-muted" />} label={MARK_LABELS.missed} />
            <Legend mark={<span className="block h-[1.5px] w-3 rounded-full bg-foreground/25" />} label={TRACKER_COPY.legendPaused} />
          </ul>
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
            {toMakeUp.length > 0 && (
              <details className="group -mb-2 mt-1 text-xs text-muted">
                <summary className="-ml-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-lg px-1 font-semibold [&::-webkit-details-marker]:hidden">
                  {TRACKER_COPY.whichPrayers(toMakeUp.length)}
                  <ChevronDownIcon size={14} className="transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none" />
                </summary>
                <ul className="space-y-1.5 border-t border-foreground/5 pb-3 pt-2" data-to-make-up>
                  {toMakeUp.slice(0, MAX_LISTED).map((m) => (
                    <li key={`${m.iso}:${m.prayer}`} className="tabular-nums">
                      {TIME_LABELS[m.prayer]} · {dayLabel(m.iso)}
                    </li>
                  ))}
                  {toMakeUp.length > MAX_LISTED && <li>+{toMakeUp.length - MAX_LISTED}</li>}
                  {madeUp > 0 && <li className="pt-1">{TRACKER_COPY.oldestFirst}</li>}
                </ul>
              </details>
            )}
          </Card>
        )}

        {!paused && (
          <section className="flex flex-wrap items-center justify-between gap-3 px-1 py-2">
            <p className="min-w-[min(12rem,100%)] flex-1 text-xs text-muted">{TRACKER_COPY.pauseHint}</p>
            <button
              type="button"
              onClick={() => {
                haptic.selection();
                pause();
              }}
              data-pause
              className="pressable min-h-11 shrink-0 rounded-full border border-foreground/15 bg-card px-4 text-sm font-semibold text-foreground"
            >
              {TRACKER_COPY.pauseAction}
            </button>
          </section>
        )}
      </main>

      <DaySheet iso={dayIso} open={dayOpen} onClose={() => setDayOpen(false)} notYet={notYet} />
      <BottomNav />
    </div>
  );
}

function Legend({ mark, label }: { mark: React.ReactNode; label: string }) {
  return (
    <li className="flex items-center gap-1.5">
      <span className="flex h-1.5 items-center" aria-hidden>
        {mark}
      </span>
      {label}
    </li>
  );
}
