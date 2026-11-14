'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import BackButton from '@/components/ui/back-button';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { useAppBack } from '@/hooks/use-app-back';
import { addDaysIso } from '@/lib/dates';
import { haptic } from '@/lib/haptics';
import { NAV_FORWARD } from '@/lib/nav';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { PRAYER_NAMES, type Place, type PrayerName } from '@/types/prayer';
import type { MatchDay, MatchResult } from '@/lib/prayer/match';
import DayEntry, { emptyTimes, type DayDraft } from './day-entry';
import { CompareTable, FitSummary } from './match-result';

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

interface Fitted {
  result: MatchResult;
  before: Record<string, Record<PrayerName, number | null>>;
}

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
    <div className="min-h-dvh bg-cream pb-[calc(6rem+env(safe-area-inset-bottom))]" data-match-wizard>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/prayer/settings" className="justify-self-start" />
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fitted, setFitted] = useState<Fitted | null>(null);
  const [applied, setApplied] = useState(false);
  const [undone, setUndone] = useState(false);

  const setDay = (i: number, next: DayDraft) => {
    setError(null);
    setDays((ds) => ds.map((d, j) => (j === i ? next : d)));
  };

  const findMatch = async () => {
    const input = days.map(toMatchDay);
    setBusy(true);
    try {
      const { checkMatchInput, matchMosque, dayMinutes } = await import('@/lib/prayer/match');
      const problem = checkMatchInput(input);
      if (problem) {
        setError(problem);
        return;
      }
      const result = matchMosque(place, input);
      if (!result) {
        setError('These times could not be matched. Check them against the timetable and try again.');
        return;
      }
      const current = calcSettingsOf(usePrayerStore.getState());
      const before = Object.fromEntries(input.map((d) => [d.iso, dayMinutes(place, d.iso, current)]));
      setFitted({ result, before });
      setApplied(false);
      setUndone(false);
      window.scrollTo({ top: 0 });
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!fitted) return;
    applyCalc(fitted.result.calc);
    haptic.success();
    setApplied(true);
    setUndone(false);
  };

  const undo = () => {
    undoCalc();
    setApplied(false);
    setUndone(true);
  };

  if (fitted) {
    const { result, before } = fitted;
    return (
      <>
        <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
          <div>
            <h2 className="text-xl font-bold text-teal">Closest match</h2>
            <p className="mt-1 text-sm text-muted">For {place.label || 'your place'}</p>
          </div>

          <Card className="p-4">
            <FitSummary calc={result.calc} />
          </Card>

          <div className="space-y-2 px-1 text-sm leading-relaxed text-muted" data-match-notes>
            <p>
              This is a fit worked out from the times you typed in, not your mosque’s own data. If its timetable
              changes, run the match again.
            </p>
            <p data-match-confidence>{result.confidence}</p>
            {result.lateHint && (
              <p className="text-foreground">
                Some times are well after the calculated start. If you typed jama’ah times, swap in the start
                times instead.
              </p>
            )}
          </div>

          <CompareTable cells={result.cells} before={before} />

          {applied && (
            <p className="flex items-center gap-2 px-1 text-sm font-medium text-teal" role="status" data-match-applied>
              <CheckIcon size={16} /> Applied. Your prayer times now follow this match.
            </p>
          )}
          {undone && (
            <p className="px-1 text-sm text-muted" role="status" data-match-undone>
              Your earlier settings are back.
            </p>
          )}
        </main>

        <ActionBar>
          {applied ? (
            <>
              <Button variant="ghost" className="flex-1" onClick={undo}>
                Undo
              </Button>
              <Button className="flex-1" onClick={done}>
                Done
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" className="flex-1" onClick={() => setFitted(null)}>
                Edit times
              </Button>
              <Button className="flex-1" onClick={apply}>
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
          <h2 className="text-xl font-bold text-teal">Your mosque’s start times</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Copy the start times from your mosque’s timetable for {place.label || 'your place'}. Use the start times
            (adhan), not the jama’ah or iqamah times. Two or more prayers are enough.
          </p>
        </div>

        {days.map((d, i) => (
          <DayEntry
            key={i}
            index={i}
            draft={d}
            onChange={(next) => setDay(i, next)}
            onRemove={i > 0 ? () => setDays((ds) => ds.slice(0, 1)) : undefined}
          />
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

        {error && (
          <p className="px-1 text-sm font-medium text-foreground" role="alert" data-match-error>
            {error}
          </p>
        )}

        {previous && <UndoEarlier onUndo={undo} />}
        {undone && (
          <p className="px-1 text-sm text-muted" role="status">
            Your earlier settings are back.
          </p>
        )}
      </main>

      <ActionBar>
        <Button className="flex-1" disabled={!filled || busy} onClick={findMatch} data-match-find>
          {busy ? 'Matching…' : 'Find the match'}
        </Button>
      </ActionBar>
    </>
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

function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="fixed right-0 bottom-0 left-0 z-20 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm"
      style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
    >
      <div className="mx-auto flex max-w-2xl gap-3">{children}</div>
    </div>
  );
}
