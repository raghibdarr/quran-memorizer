'use client';

import { useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import { formatHijri, hijriEngine, toHijri } from '@/lib/hijri/convert';
import {
  addHijriMonths,
  formatCivil,
  formatCivilShort,
  formatHijriMonth,
  hijriMonthOf,
  monthGrid,
  sameMonth,
  type HijriMonthRef,
} from '@/lib/hijri/calendar';
import { daysUntil, eventsOn, occurrencesInMonth, upcomingOccasions } from '@/lib/hijri/events';
import { usePrayerStore } from '@/stores/prayer-store';
import { cn } from '@/lib/cn';
import ScreenHeader from './screen-header';
import MonthGrid from './month-grid';
import EventRow from './event-row';
import SightingExplainer from './sighting-explainer';
import { useNow } from './use-now';
import { useHijriToday } from './use-hijri-today';

const span = (a: string, b: string) => (a === b ? formatCivilShort(a) : `${formatCivilShort(a)} – ${formatCivilShort(b)}`);

function inDays(n: number): string {
  if (n === 0) return 'now';
  if (n === 1) return 'tomorrow';
  return `in ${n} days`;
}

/** /calendar: the Hijri month grid with Gregorian dates, expected occasions, and the sighting positions */
export default function CalendarClient() {
  const now = useNow(60_000);
  const { today, offset } = useHijriToday(now);
  const setHijriOffset = usePrayerStore((s) => s.setHijriOffset);
  const todayMonth = hijriMonthOf(today, offset);
  const [view, setView] = useState<HijriMonthRef>(todayMonth);
  const [selected, setSelected] = useState<string | null>(null);

  const grid = useMemo(() => monthGrid(view, { offset, today }), [view, offset, today]);
  const monthEvents = useMemo(() => occurrencesInMonth(view, offset), [view, offset]);
  const upcoming = useMemo(() => upcomingOccasions(today, offset, 5), [today, offset]);
  const engine = useMemo(() => hijriEngine(), []);

  const onToday = sameMonth(view, todayMonth);
  const sel = selected && grid.days.some((d) => d.iso === selected) ? selected : onToday ? today : null;
  const selEvents = sel ? eventsOn(sel, offset) : [];

  const go = (n: number) => {
    setView((v) => addHijriMonths(v, n));
    setSelected(null);
  };

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]">
      <ScreenHeader title="Hijri calendar" back="/prayer" />

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        <section aria-label="Today" className="px-1" data-hijri-today>
          <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Today · expected</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{formatHijri(toHijri(today, offset))}</p>
          <p className="text-sm text-muted">{formatCivil(today)}</p>
        </section>

        <Card className="px-3 py-4 sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous month"
              className="pressable flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              <Chevron dir="left" />
            </button>
            <div className="min-w-0 text-center" aria-live="polite">
              <h2 className="truncate text-base font-bold text-foreground" data-month-title>{formatHijriMonth(view)}</h2>
              <p className="truncate text-xs text-muted">{grid.gregorianSpan}</p>
            </div>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next month"
              className="pressable flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
            >
              <Chevron dir="right" />
            </button>
          </div>

          <MonthGrid grid={grid} selected={sel} onSelect={setSelected} />

          <div className="mt-3 flex min-h-8 items-center justify-between gap-2 px-1">
            <span className="flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />Occasion</span>
              <span className="flex items-center gap-1"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-teal/60" />Voluntary fast</span>
            </span>
            {!onToday && (
              <button
                type="button"
                onClick={() => {
                  setView(todayMonth);
                  setSelected(null);
                }}
                className="min-h-8 rounded-full px-3 text-xs font-semibold text-teal hover:bg-teal/10"
              >
                Back to today
              </button>
            )}
          </div>
        </Card>

        {sel && (sel !== today || selEvents.length > 0) && (
          <Card className="py-4">
            <div data-selected-day={sel} aria-live="polite">
              <p className="text-sm font-semibold text-foreground">{formatCivil(sel)}</p>
              <p className="text-xs text-muted">{formatHijri(toHijri(sel, offset))} · expected</p>
            </div>
            {selEvents.length > 0 && (
              <ul className="mt-1 divide-y divide-foreground/5">
                {selEvents.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            )}
          </Card>
        )}

        {monthEvents.length > 0 && (
          <section aria-labelledby="month-events">
            <h2 id="month-events" className="px-1 text-xs font-bold uppercase tracking-wider text-muted">
              In {formatHijriMonth(view).replace(/ \d+$/, '')} · expected
            </h2>
            <ul className="mt-2 divide-y divide-foreground/5 rounded-2xl border border-foreground/10 bg-card px-5">
              {monthEvents.map((o) => (
                <EventRow key={o.event.id} event={o.event} when={span(o.first, o.last)} />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="coming-up">
          <h2 id="coming-up" className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Coming up · expected</h2>
          <ul className="mt-2 divide-y divide-foreground/5 rounded-2xl border border-foreground/10 bg-card px-5" data-coming-up>
            {upcoming.map((o) => (
              <li key={o.event.id} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{o.event.title}</span>
                  <span className="block text-xs text-muted">{formatCivil(o.first)}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-teal">{inDays(daysUntil(today, o))}</span>
              </li>
            ))}
          </ul>
          <Link href="/ramadan" className="pressable mt-3 flex min-h-12 items-center justify-between rounded-xl border border-teal/20 bg-teal/5 px-4 py-2.5 text-sm">
            <span><span className="font-semibold text-teal">Ramadan</span><span className="text-muted"> · suhoor, iftar and your fasts</span></span>
            <span aria-hidden className="text-teal">›</span>
          </Link>
        </section>

        <Card className="py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Match your local announcement</p>
              <p className="text-xs text-muted">
                {offset === 0 ? 'Months start on the calculated day' : `Months start ${Math.abs(offset)} day${Math.abs(offset) === 1 ? '' : 's'} ${offset > 0 ? 'earlier' : 'later'} than calculated`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Hijri date adjustment">
              <StepButton label="Start months a day later" disabled={offset <= -2} onClick={() => setHijriOffset(offset - 1)}>−</StepButton>
              <span className="w-8 text-center text-sm font-semibold tabular-nums text-foreground" data-hijri-offset>
                {offset > 0 ? `+${offset}` : offset}
              </span>
              <StepButton label="Start months a day earlier" disabled={offset >= 2} onClick={() => setHijriOffset(offset + 1)}>+</StepButton>
            </div>
          </div>
        </Card>

        <SightingExplainer engine={engine} />
      </main>

      <BottomNav />
    </div>
  );
}

function StepButton({ children, label, disabled, onClick }: { children: React.ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'pressable flex h-11 w-11 items-center justify-center rounded-full border border-foreground/15 text-lg font-semibold text-foreground',
        'disabled:opacity-35',
      )}
    >
      {children}
    </button>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points={dir === 'left' ? '15 18 9 12 15 6' : '9 18 15 12 9 6'} />
    </svg>
  );
}
