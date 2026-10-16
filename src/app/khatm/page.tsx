'use client';

import { useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import ProgressBar from '@/components/ui/progress-bar';
import { mushafHref } from '@/lib/routes';
import { KHATM_PAGES, KHATM_PRESETS, khatmStatus } from '@/lib/khatm';
import { useReaderStore } from '@/stores/reader-store';
import { cn } from '@/lib/cn';

/**
 * Khatm planner (roadmap #14): read the whole mushaf in a set number of days.
 * Pages count as read when you stay on them in the page view; today's share is
 * one tap away.
 */
export default function KhatmPage() {
  const khatm = useReaderStore((s) => s.khatm);
  const startKhatm = useReaderStore((s) => s.startKhatm);
  const endKhatm = useReaderStore((s) => s.endKhatm);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [custom, setCustom] = useState(40);
  const active = khatm && !khatm.endedAt ? khatm : null;
  const s = active ? khatmStatus(active) : null;

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <BackButton fallback="/" />
          <span className="text-sm font-semibold text-teal">Khatm</span>
          <span className="w-11" />
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-5 pb-[var(--tabbar-clearance)]">
        {active && s ? (
          <>
            <div className="rounded-2xl bg-card p-5" data-khatm-status>
              <p className="text-[11px] font-bold uppercase tracking-wider text-teal">
                {active.kind === 'ramadan' ? 'Ramadan khatm' : 'Khatm'} · day {s.dayNo} of {active.days}
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground">
                {s.finished ? 'Khatm complete' : `${s.read} of ${KHATM_PAGES} pages`}
              </p>
              <ProgressBar value={(s.read / KHATM_PAGES) * 100} className="mt-3" />
              <p className="mt-3 text-sm text-muted">
                {s.finished
                  ? 'You read the whole Quran. May Allah accept it.'
                  : s.overdue
                    ? `The ${active.days} days are over: ${KHATM_PAGES - s.read} pages to go.`
                    : s.behind === 0
                      ? "You're on track."
                      : s.behind <= s.todayLeft
                        ? `Today's pages: ${s.today[0]}–${s.today[1]}, ${s.todayLeft} left.`
                        : `${s.behind} pages to catch up, including today's ${s.today[0]}–${s.today[1]}.`}
              </p>
              {!s.finished && s.nextPage && (
                <Link
                  href={mushafHref(s.todayLeft > 0 && s.behind <= s.todayLeft ? firstUnread(active.pagesRead, s.today) : s.nextPage)}
                  className="tactile-btn mt-4 flex min-h-12 items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal"
                >
                  {s.behind > 0 ? 'Read on' : 'Read ahead'}
                </Link>
              )}
              <p className="mt-3 text-xs text-muted">A page counts as read when you stay on it for a little while in the page view.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmEnd(true)}
              className="min-h-11 w-full rounded-xl text-sm font-semibold text-muted hover:text-red-500"
            >
              {s.finished ? 'Start another khatm' : 'End this khatm'}
            </button>
            <ConfirmSheet
              open={confirmEnd}
              title={s.finished ? 'Start another khatm?' : 'End this khatm?'}
              message={s.finished ? 'This one is kept as done; you can set up the next one.' : `You've read ${s.read} pages. Ending it lets you start a new plan.`}
              confirmLabel={s.finished ? 'Set up another' : 'End it'}
              destructive={!s.finished}
              onConfirm={() => { setConfirmEnd(false); endKhatm(); }}
              onCancel={() => setConfirmEnd(false)}
            />
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-card p-5">
              <p className="text-lg font-bold text-foreground">Read the whole Quran</p>
              <p className="mt-1 text-sm text-muted">
                Pick how long to take. Each day gets an even share of the 604 pages of the mushaf.
              </p>
            </div>
            <ul className="space-y-2">
              {KHATM_PRESETS.map((p) => (
                <li key={p.days}>
                  <button
                    type="button"
                    onClick={() => startKhatm(p.days, p.kind)}
                    className={cn('tactile-chip flex min-h-14 w-full items-center justify-between rounded-xl bg-card px-4 text-left', p.kind === 'ramadan' && 'ring-1 ring-gold/40')}
                  >
                    <span className="text-sm font-semibold text-foreground">{p.label}</span>
                    <span className="text-xs text-muted">about {Math.ceil(KHATM_PAGES / p.days)} pages a day</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2 rounded-xl bg-card px-4 py-3">
              <label htmlFor="khatm-days" className="text-sm text-foreground">Or</label>
              <input
                id="khatm-days"
                type="number"
                min={1}
                max={1000}
                value={custom}
                onChange={(e) => setCustom(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
                className="w-20 rounded-lg border border-foreground/15 bg-transparent px-2 py-1.5 text-base text-foreground"
              />
              <span className="text-sm text-muted">days</span>
              <button type="button" onClick={() => startKhatm(custom)} className="ml-auto min-h-11 rounded-full bg-teal px-4 text-xs font-bold text-on-teal">
                Start
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function firstUnread(read: Record<string, number>, [a, b]: [number, number]): number {
  for (let p = a; p <= b; p++) if (!read[String(p)]) return p;
  return a;
}
