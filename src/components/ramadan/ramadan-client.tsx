'use client';

import { useRouter } from 'next/navigation';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import SegmentedControl from '@/components/ui/segmented-control';
import ScreenHeader from '@/components/calendar/screen-header';
import { useNow } from '@/components/calendar/use-now';
import { useHijriToday } from '@/components/calendar/use-hijri-today';
import { formatCivil } from '@/lib/hijri/calendar';
import { RAMADAN, toHijri } from '@/lib/hijri/convert';
import { activePause, fastOptionsFor, isPaused, latestRamadan, ramadanSeason, resumeOf } from '@/lib/worship/ramadan';
import { khatmStatus } from '@/lib/khatm';
import { NAV_FORWARD } from '@/lib/nav';
import { usePlaceStore } from '@/stores/place-store';
import { usePrayerStore } from '@/stores/prayer-store';
import { useReaderStore } from '@/stores/reader-store';
import { useWorshipStore } from '@/stores/worship-store';
import type { RamadanMode } from '@/types/prayer';
import FastHero from './fast-hero';
import MarkChips from './mark-chips';
import MakeUp from './make-up';
import RamadanLog from './ramadan-log';
import { useFastTimes } from './use-fast-times';

const MODES: { value: RamadanMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

const MODE_HINTS: Record<RamadanMode, string> = {
  auto: 'On through the expected month, with a reminder on the Prayer screen from a week before.',
  on: 'On now, whatever the calendar says. Useful when your local start differs.',
  off: 'Off. The Prayer screen shows no Ramadan reminder.',
};

/** /ramadan: suhoor and iftar countdown, the fasting log, fasts to make up, and the Ramadan khatm */
export default function RamadanClient() {
  const router = useRouter();
  const now = useNow(30_000);
  const { today, offset } = useHijriToday(now);
  const hasPlace = usePlaceStore((s) => !!s.place);
  const mode = usePrayerStore((s) => s.ramadanMode);
  const setMode = usePrayerStore((s) => s.setRamadanMode);
  const imsakMin = usePrayerStore((s) => s.imsakMin);
  const setImsakMin = usePrayerStore((s) => s.setImsakMin);
  const fasts = useWorshipStore((s) => s.fasts);
  const pauses = useWorshipStore((s) => s.pauses);
  const markFast = useWorshipStore((s) => s.markFast);
  const clearFast = useWorshipStore((s) => s.clearFast);
  const startPause = useWorshipStore((s) => s.startPause);
  const endPause = useWorshipStore((s) => s.endPause);
  const removePause = useWorshipStore((s) => s.removePause);
  const khatm = useReaderStore((s) => s.khatm);
  const startKhatm = useReaderStore((s) => s.startKhatm);

  const season = ramadanSeason(today, offset, mode);
  const times = useFastTimes(true, today);
  const span = latestRamadan(today, offset);
  const pause = activePause(pauses, today);
  const inSpan = today >= span.start && today <= span.end;
  const activeKhatm = khatm && !khatm.endedAt ? khatm : null;
  const voluntary = Object.entries(fasts).filter(
    ([iso, e]) => e.s === 'fasted' && !isPaused(iso, pauses) && toHijri(iso, offset).month !== RAMADAN,
  ).length;

  const resume = () => {
    if (!pause) return;
    const r = resumeOf(pause, today);
    if (r.kind === 'remove') removePause(pause.id);
    else endPause(pause.id, r.to);
  };

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <ScreenHeader title="Ramadan" back="/prayer" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <FastHero season={season} times={times} hasPlace={hasPlace} imsakMin={imsakMin} now={now} countdown={season.active || fasts[today]?.s === 'fasted'} />

        {pause && (
          <section data-paused>
            <Card className="py-4">
              <p className="text-base font-semibold text-foreground">The log is paused</p>
              <p className="mt-0.5 text-sm text-muted">
                Since {formatCivil(pause.from, { year: false })}. Days in a pause are left out of every count.
              </p>
              <button
                type="button"
                onClick={resume}
                className="pressable mt-3 min-h-11 rounded-xl border border-teal/30 bg-teal/5 px-4 text-sm font-semibold text-teal"
              >
                Resume
              </button>
            </Card>
          </section>
        )}

        {!inSpan && !pause && (
          <section data-today-fast>
            <Card className="py-4">
              <p className="text-base font-semibold text-foreground">Today</p>
              <p className="text-xs text-muted">{formatCivil(today)}</p>
              <div className="mt-3">
                <MarkChips
                  options={fastOptionsFor(today, offset, season.active)}
                  value={fasts[today]?.s}
                  onChange={(m) => (m ? markFast(today, m) : clearFast(today))}
                  labels={season.active ? undefined : { fasted: "I'm fasting today" }}
                />
              </div>
              <p className="mt-3 text-xs text-muted">
                {voluntary === 0 ? 'Voluntary fasts you log are counted here.' : `${voluntary} voluntary fast${voluntary === 1 ? '' : 's'} logged.`}{' '}
                <Link href="/calendar" className="font-semibold text-teal">See the calendar</Link> for the days many keep.
              </p>
            </Card>
          </section>
        )}

        <RamadanLog span={span} today={today} collapsible={!inSpan} />

        <MakeUp offset={offset} />

        {activeKhatm ? (
          <Link href="/khatm" className="pressable flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm" data-khatm-link>
            <span>
              <span className="font-semibold text-teal">{activeKhatm.kind === 'ramadan' ? 'Ramadan khatm' : 'Your khatm'}</span>
              <span className="text-muted"> · day {khatmStatus(activeKhatm, now).dayNo} of {activeKhatm.days}</span>
            </span>
            <span aria-hidden className="text-teal">›</span>
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              startKhatm(30, 'ramadan');
              router.push('/khatm', { transitionTypes: [NAV_FORWARD] });
            }}
            className="pressable flex min-h-12 w-full items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-left text-sm"
            data-khatm-link
          >
            <span>
              <span className="font-semibold text-teal">Start a Ramadan khatm</span>
              <span className="text-muted"> · the whole Quran in 30 days</span>
            </span>
            <span aria-hidden className="text-teal">›</span>
          </button>
        )}

        <Card className="space-y-4 py-4">
          <div>
            <p className="text-base font-semibold text-foreground">Ramadan mode</p>
            <SegmentedControl options={MODES} value={mode} onChange={setMode} className="mt-2" />
            <p className="mt-2 text-xs text-muted">{MODE_HINTS[mode]}</p>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-foreground/10 pt-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-balance text-foreground">Suhoor ends before Fajr</p>
              <p className="text-xs text-muted">A precaution. The fast itself begins at Fajr.</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Minutes before Fajr">
              <Step label="Fewer minutes" disabled={imsakMin <= 0} onClick={() => setImsakMin(imsakMin - 5)}>−</Step>
              <span className="w-12 text-center text-sm font-semibold tabular-nums text-foreground" data-imsak>{imsakMin} min</span>
              <Step label="More minutes" disabled={imsakMin >= 30} onClick={() => setImsakMin(imsakMin + 5)}>+</Step>
            </div>
          </div>
          {!pause && (
            <div className="border-t border-foreground/10 pt-4">
              <p className="text-xs text-muted">Pausing leaves the days that follow out of your fasting and prayer counts.</p>
              <button
                type="button"
                onClick={() => startPause(today)}
                className="pressable mt-2 min-h-11 rounded-xl border border-foreground/15 px-4 text-sm font-semibold text-foreground hover:bg-foreground/5"
              >
                Pause the log
              </button>
            </div>
          )}
        </Card>

        <Link href="/calendar" className="pressable flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm">
          <span><span className="font-semibold text-teal">Hijri calendar</span><span className="text-muted"> · expected dates and occasions</span></span>
          <span aria-hidden className="text-teal">›</span>
        </Link>
      </main>

      <BottomNav />
    </div>
  );
}

function Step({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="pressable relative flex h-9 w-9 items-center justify-center rounded-full border border-foreground/15 text-lg font-semibold text-foreground after:absolute after:-inset-1 after:content-[''] disabled:opacity-35"
    >
      {children}
    </button>
  );
}
