'use client';

import { useState } from 'react';
import Card from '@/components/ui/card';
import { formatCivil, formatCivilShort } from '@/lib/hijri/calendar';
import { countFasts, isPaused, ramadanDays, type RamadanSpan } from '@/lib/worship/ramadan';
import { useWorshipStore, type FastMark } from '@/stores/worship-store';
import { ChevronDownIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import MarkChips from './mark-chips';

const CELL: Record<FastMark, string> = {
  fasted: 'bg-teal text-on-teal',
  owed: 'bg-gold/20 text-foreground ring-1 ring-inset ring-gold',
  exempt: 'border border-dashed border-foreground/40 bg-transparent text-muted',
};

const SWATCH: Record<FastMark, string> = {
  fasted: 'bg-teal',
  owed: 'bg-gold/20 ring-1 ring-inset ring-gold',
  exempt: 'border border-dashed border-foreground/50',
};

const LEGEND: { mark: FastMark; label: string }[] = [
  { mark: 'fasted', label: 'fasted' },
  { mark: 'owed', label: 'to make up' },
  { mark: 'exempt', label: 'exempt' },
];

/**
 * One Ramadan's days as a grid: tap a day, then mark it. Days ahead of today
 * can't be marked; days inside a pause show faded and count for nothing.
 */
export default function RamadanLog({ span, today, collapsible = false }: { span: RamadanSpan; today: string; collapsible?: boolean }) {
  const fasts = useWorshipStore((s) => s.fasts);
  const pauses = useWorshipStore((s) => s.pauses);
  const markFast = useWorshipStore((s) => s.markFast);
  const clearFast = useWorshipStore((s) => s.clearFast);
  const days = ramadanDays(span);
  const defaultSel = days.find((d) => d.iso === today)?.iso ?? (today > span.end ? span.end : span.start);
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsible);
  const sel = picked && days.some((d) => d.iso === picked) ? picked : defaultSel;
  const selDay = days.find((d) => d.iso === sel)!;
  const future = sel > today;
  const counts = countFasts(fasts, pauses, { from: span.start, to: span.end });

  return (
    <section data-ramadan-log>
      <Card className="px-4 py-4">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="flex min-h-11 w-full items-center justify-between gap-2 px-1 text-left"
          >
            <span>
              <span className="block text-base font-semibold text-foreground">Log for Ramadan {span.hijriYear}</span>
              <span className="block text-xs text-muted">
                {formatCivilShort(span.start)} – {formatCivilShort(span.end)} · expected
              </span>
            </span>
            <ChevronDownIcon size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
          </button>
        ) : (
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="shrink-0 text-base font-semibold whitespace-nowrap text-foreground">Ramadan {span.hijriYear}</h2>
            <span className="text-right text-xs text-muted">
              {formatCivilShort(span.start)} – {formatCivilShort(span.end)} · expected
            </span>
          </div>
        )}
        {open && (
          <>
            <ol className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-10" aria-label={`Days of Ramadan ${span.hijriYear}`}>
              {days.map((d) => {
                const mark = fasts[d.iso]?.s;
                const paused = isPaused(d.iso, pauses);
                const ahead = d.iso > today;
                const isSel = d.iso === sel;
                return (
                  <li key={d.iso}>
                    <button
                      type="button"
                      onClick={() => setPicked(d.iso)}
                      aria-pressed={isSel}
                      aria-label={`Day ${d.day}, ${formatCivil(d.iso, { year: false })}${mark ? `: ${mark === 'owed' ? 'to make up' : mark}` : ''}${paused ? ', paused' : ''}`}
                      data-day={d.iso}
                      data-mark={mark ?? ''}
                      className={cn(
                        'pressable flex aspect-square w-full items-center justify-center rounded-lg text-sm font-semibold tabular-nums',
                        mark ? CELL[mark] : 'bg-foreground/[0.04] text-foreground',
                        ahead && 'text-muted/60',
                        paused && 'opacity-40',
                        d.iso === today && !isSel && 'ring-2 ring-teal',
                        isSel && 'outline-2 outline-offset-2 outline-teal',
                      )}
                    >
                      {d.day}
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-4 border-t border-foreground/10 pt-3">
              <p className="text-sm font-semibold text-foreground">
                Day {selDay.day} · <span className="font-normal text-muted">{formatCivil(sel)}</span>
              </p>
              {isPaused(sel, pauses) ? (
                <p className="mt-2 text-sm text-muted">This day is inside a pause, so it isn&apos;t counted.</p>
              ) : future ? (
                <p className="mt-2 text-sm text-muted">You can mark this day when it comes.</p>
              ) : (
                <div className="mt-2">
                  <MarkChips
                    options={['fasted', 'owed', 'exempt']}
                    value={fasts[sel]?.s}
                    onChange={(m) => (m ? markFast(sel, m) : clearFast(sel))}
                  />
                </div>
              )}
            </div>

            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-muted" data-ramadan-counts>
              {LEGEND.map(({ mark, label }) => (
                <span key={mark} className="flex items-center gap-1.5" data-count={mark}>
                  <span aria-hidden className={cn('h-2.5 w-2.5 shrink-0 rounded-[3px]', SWATCH[mark])} />
                  <span className="tabular-nums">
                    {counts[mark]} {label}
                  </span>
                </span>
              ))}
            </p>
          </>
        )}
      </Card>
    </section>
  );
}
