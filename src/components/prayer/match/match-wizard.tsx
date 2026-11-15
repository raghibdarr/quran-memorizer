'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/ui/back-button';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { useAppBack } from '@/hooks/use-app-back';
import { cn } from '@/lib/cn';
import { addDaysIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { NAV_FORWARD } from '@/lib/nav';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { PRAYER_NAMES, TIME_LABELS, type Place, type PrayerCalcSettings, type PrayerName } from '@/types/prayer';
import type { MatchDay, MatchResult } from '@/lib/prayer/match';
import DayEntry, { emptyTimes, type DayDraft } from './day-entry';
import { CompareTable, FitSummary, type CompareDay } from './match-result';

const noSubscribe = () => () => {};

/** Today on the place's calendar (the timetable row the user is most likely looking at) */
function todayAt(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(Date.now());
  } catch {
    return new Intl.DateTimeFormat('en-CA').format(Date.now());
  }
}

function toMatchDay(d: DayDraft): MatchDay {
  const times: MatchDay['times'] = {};
  for (const p of PRAYER_NAMES) {
    const m = /^(\d{2}):(\d{2})/.exec(d.times[p]);
    if (m) times[p] = Number(m[1]) * 60 + Number(m[2]);
  }
  return { iso: d.iso, times };
}

/** The five prayers' settings compared as the app will run them (sunrise is the user's own and not fitted) */
function sameCalc(a: PrayerCalcSettings, b: PrayerCalcSettings): boolean {
  if (a.method !== b.method || a.madhab !== b.madhab || a.highLatRule !== b.highLatRule) return false;
  if (PRAYER_NAMES.some((p) => a.offsets[p] !== b.offsets[p])) return false;
  if (a.method !== 'custom') return true;
  const x = a.customAngles;
  const y = b.customAngles;
  return x?.fajr === y?.fajr && x?.isha === y?.isha && x?.ishaInterval === y?.ishaInterval;
}

/** "Dhuhr", "Dhuhr and Asr", "Dhuhr, Asr and Maghrib" */
function listNames(prayers: readonly PrayerName[]): string {
  const names = prayers.map((p) => TIME_LABELS[p]);
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

interface Fitted {
  result: MatchResult;
  days: CompareDay[];
  /** The fit is the calculation already in use: Apply would change nothing */
  same: boolean;
  /** Different settings, but every time on the entered dates comes out the same */
  sameTimes: boolean;
}

const ERROR_ID = 'match-error';
/** Matches match.ts LATE_HINT_MIN: the daytime offsets that read as jama'ah times */
const LATE_MIN = 15;

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

/**
 * Match my mosque (spec 2.7): type the mosque's start times for one or two
 * dates, see the closest calculation beside the current one, Apply or Undo.
 * The fitting code (and adhan with it) loads only when the user asks for a match.
 */
export default function MatchWizard() {
  const router = useRouter();
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);
  const place = usePlaceStore((s) => s.place);

  useEffect(() => {
    if (mounted && !place) router.replace('/prayer/setup', { transitionTypes: [NAV_FORWARD] });
  }, [mounted, place, router]);

  return (
    <div className="min-h-dvh bg-cream" data-match-wizard>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)] items-center gap-1">
          <BackButton fallback="/prayer/settings" className="max-w-full justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Match my mosque</h1>
          <span aria-hidden />
        </div>
      </div>
      {mounted && place ? <Wizard place={place} /> : null}
    </div>
  );
}

function Wizard({ place }: { place: Place }) {
  const done = useAppBack('/prayer/settings');
  const previous = usePrayerStore((s) => s.previous);
  const applyCalc = usePrayerStore((s) => s.applyCalc);
  const undoCalc = usePrayerStore((s) => s.undoCalc);
  const [days, setDays] = useState<DayDraft[]>(() => [{ iso: todayAt(place.tz), times: emptyTimes() }]);
  const [error, setError] = useState<{ text: string; days: number[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fitted, setFitted] = useState<Fitted | null>(null);
  const [applied, setApplied] = useState(false);
  const [undone, setUndone] = useState(false);

  const setDay = (i: number, next: DayDraft) => {
    setError(null);
    setDays((ds) => ds.map((d, j) => (j === i ? next : d)));
  };

  const showError = (text: string, bad: number[]) => {
    setError({ text, days: bad });
    // The message sits in the action bar; bring the date card it is about into view
    if (bad.length) {
      requestAnimationFrame(() =>
        document.querySelector(`[data-match-day="${bad[0]}"]`)?.scrollIntoView({ block: 'center', behavior: scrollBehavior() }),
      );
    }
  };

  const findMatch = async () => {
    const input = days.map(toMatchDay);
    setBusy(true);
    try {
      const { checkMatchInput, matchMosque, dayMinutes } = await import('@/lib/prayer/match');
      const problem = checkMatchInput(input);
      if (problem) {
        // Which date it is about: the one that fails on its own, or the second when both share a date
        const bad = input.map((d, i) => (checkMatchInput([d]) ? i : -1)).filter((i) => i >= 0);
        showError(problem, bad.length ? bad : input.length === 2 ? [1] : []);
        return;
      }
      const result = matchMosque(place, input);
      if (!result) {
        showError('These times could not be matched. Check them against the timetable and try again.', []);
        return;
      }
      const current = calcSettingsOf(usePrayerStore.getState());
      const compare: CompareDay[] = input.map((d) => ({
        iso: d.iso,
        entered: d.times,
        before: dayMinutes(place, d.iso, current),
        after: dayMinutes(place, d.iso, result.calc),
      }));
      const same = sameCalc(result.calc, current);
      const sameTimes = !same && compare.every((d) => PRAYER_NAMES.every((p) => d.before[p] === d.after[p]));
      setFitted({ result, days: compare, same, sameTimes });
      setApplied(false);
      setUndone(false);
      window.scrollTo({ top: 0 });
    } catch {
      // The matcher is loaded on demand: offline on the web it may not be there yet
      showError('The matcher could not be loaded. Check your connection and try again.', []);
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!fitted) return;
    // The fit covers the five prayers only: a sunrise adjustment the user set stays
    // theirs. Moving from a named method to our own angles, the minutes that method
    // built in to sunrise come along (calc.offsets.sunrise) so sunrise stays put;
    // settings already on custom angles carry theirs in the stored offset.
    const calc = fitted.result.calc;
    const current = usePrayerStore.getState();
    const carried = current.method === 'custom' ? 0 : calc.offsets.sunrise;
    applyCalc({ ...calc, offsets: { ...calc.offsets, sunrise: current.offsets.sunrise + carried } });
    haptic.success();
    setApplied(true);
    setUndone(false);
  };

  const undo = () => {
    undoCalc();
    setApplied(false);
    setUndone(true);
  };

  const undoneNote = undone ? (
    <StatusNote tone="quiet" data-match-undone>
      Your earlier settings are back.
    </StatusNote>
  ) : null;

  if (fitted) {
    const { result, days: compare, same, sameTimes } = fitted;
    // Large daytime offsets usually mean jama'ah times; a poor fit means no
    // method follows this timetable. Either way, Apply is not the next step.
    const late = PRAYER_NAMES.filter((p) => result.calc.offsets[p] >= LATE_MIN);
    const caution = result.lateHint || result.poorFit;
    return (
      <>
        <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
          <div>
            <h2 className="text-xl font-bold text-foreground">Closest match</h2>
            <p className="mt-1 text-sm text-muted">For {place.label || 'your place'}</p>
          </div>

          {result.lateHint ? (
            <Callout data-match-late>
              <p className="font-semibold">These may be jama’ah times</p>
              <p className="mt-1">
                {late.length ? `${listNames(late)} ${late.length === 1 ? 'is' : 'are'}` : 'Some times are'} well after the
                calculated start. Swap in the start times (adhan) from the timetable and match again.
              </p>
            </Callout>
          ) : result.poorFit ? (
            <Callout>
              <p data-match-confidence>{result.confidence}</p>
            </Callout>
          ) : null}

          <Card className="p-4">
            <FitSummary calc={result.calc} />
          </Card>

          <div className="space-y-2 px-1 text-sm leading-relaxed text-muted" data-match-notes>
            {same ? (
              <p className="font-medium text-foreground" data-match-same>
                Your settings already match these times, so there is nothing to change.
              </p>
            ) : sameTimes ? (
              <p className="text-foreground" data-match-same-times>
                The times are the same on {compare.length > 1 ? 'these dates' : 'this date'}; they may differ at other
                times of year.
              </p>
            ) : null}
            <p>
              This is a fit worked out from the times you typed in, not your mosque’s own data. If its timetable
              changes, run the match again.
            </p>
            {!caution && <p data-match-confidence>{result.confidence}</p>}
          </div>

          <CompareTable days={compare} />
        </main>

        <ActionBar
          note={
            applied ? (
              <StatusNote tone="done" data-match-applied>
                Applied. Your prayer times now follow this match.
              </StatusNote>
            ) : (
              undoneNote
            )
          }
        >
          {applied ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={undo}>
                Undo
              </Button>
              <Button className="flex-1" onClick={done}>
                Done
              </Button>
            </>
          ) : same ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setFitted(null)}>
                Edit times
              </Button>
              <Button className="flex-1" onClick={done}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant={caution ? 'primary' : 'ghost'} className="flex-1" onClick={() => setFitted(null)}>
                Edit times
              </Button>
              <Button variant={caution ? 'ghost' : 'primary'} className="flex-1" onClick={apply}>
                Apply
              </Button>
            </>
          )}
        </ActionBar>
      </>
    );
  }

  const filled = days.some((d) => PRAYER_NAMES.some((p) => d.times[p]));
  return (
    <>
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <div>
          <h2 className="text-xl font-bold text-foreground">Your mosque’s start times</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Copy the start times from your mosque’s timetable for {place.label || 'your place'}. Use the start times
            (adhan), not the jama’ah or iqamah times. Two or more prayers are enough.
          </p>
        </div>

        {days.map((d, i) => (
          <div key={i} data-match-day={i}>
            <DayEntry
              index={i}
              draft={d}
              onChange={(next) => setDay(i, next)}
              onRemove={
                i > 0
                  ? () => {
                      setError(null);
                      setDays((ds) => ds.slice(0, 1));
                    }
                  : undefined
              }
              errorId={error?.days.includes(i) ? ERROR_ID : undefined}
            />
          </div>
        ))}

        {days.length === 1 ? (
          <button
            type="button"
            onClick={() => setDays((ds) => [...ds, { iso: addDaysIso(ds[0].iso || todayAt(place.tz), 30), times: emptyTimes() }])}
            className="flex min-h-11 w-full items-center justify-center rounded-xl border border-dashed border-foreground/15 px-4 text-sm font-semibold text-teal hover:bg-foreground/[0.03]"
            data-match-add-date
          >
            Add a second date
          </button>
        ) : null}
        <p className="px-1 text-xs leading-relaxed text-muted">
          {days.length === 1
            ? 'One date gives a match. A second date about a month away makes it follow the seasons.'
            : 'A date about a month from the first works best.'}
        </p>

        {previous && <UndoEarlier onUndo={undo} />}
      </main>

      <ActionBar
        note={
          error ? (
            <p
              id={ERROR_ID}
              className="animate-[phase-in_200ms_ease-out] rounded-xl border border-miss/30 bg-miss/10 px-3 py-2.5 text-sm font-medium text-miss"
              role="alert"
              data-match-error
            >
              {error.text}
            </p>
          ) : !filled ? (
            <p className="px-1 text-xs text-muted" data-match-hint>
              Enter at least one start time.
            </p>
          ) : (
            undoneNote
          )
        }
      >
        <Button className="flex-1" disabled={!filled || busy} onClick={findMatch} data-match-find>
          {busy ? 'Matching…' : 'Find the match'}
        </Button>
      </ActionBar>
    </>
  );
}

type DataAttrs = { [k: `data-${string}`]: unknown };

/** A gold note for when the fit should not be applied as it stands */
function Callout({ children, ...data }: { children: React.ReactNode } & DataAttrs) {
  return (
    <div className="rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-sm leading-relaxed text-gold-deep" {...data}>
      {children}
    </div>
  );
}

/** A state change (Applied, settings back), shown just above the buttons where the tap was */
function StatusNote({ tone, children, ...data }: { tone: 'done' | 'quiet'; children: React.ReactNode } & DataAttrs) {
  return (
    <p
      className={cn(
        'flex animate-[phase-in_200ms_ease-out] items-start gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
        tone === 'done' ? 'bg-teal/10 text-teal' : 'bg-foreground/5 text-muted',
      )}
      {...data}
    >
      {tone === 'done' && <CheckIcon size={16} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  );
}

function UndoEarlier({ onUndo }: { onUndo: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-2">
      <p className="text-xs leading-relaxed text-muted">You applied a match before.</p>
      <button type="button" onClick={onUndo} className="min-h-11 shrink-0 px-2 text-xs font-semibold text-teal hover:underline">
        Put back earlier settings
      </button>
    </div>
  );
}

/**
 * The fixed bar of buttons, with an optional note above them (an error, or
 * what just changed) so feedback lands where the user tapped. A spacer in the
 * page keeps the end of the content clear of the bar at whatever height it is.
 */
function ActionBar({ note, children }: { note?: React.ReactNode; children: React.ReactNode }) {
  const bar = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(80);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <>
      <div aria-hidden style={{ height: height + 16 }} />
      <div
        ref={bar}
        className="fixed right-0 bottom-0 left-0 z-20 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto max-w-2xl">
          {/* Stays mounted so a status that appears inside it is announced */}
          <div aria-live="polite" className="mb-3 empty:hidden">
            {note}
          </div>
          <div className="flex gap-3">{children}</div>
        </div>
      </div>
    </>
  );
}
