'use client';

import { useMemo } from 'react';
import { HIJRI_MONTHS } from '@/lib/hijri/convert';
import { weekdayHeaders, type GridDay, type MonthGrid as Grid } from '@/lib/hijri/calendar';
import { eventsOnHijri, isWeekly } from '@/lib/hijri/events';
import { cn } from '@/lib/cn';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day's dot: gold for an occasion, teal for a voluntary fast (weekly fasts get none) */
function dotOf(d: GridDay): 'occasion' | 'fast' | null {
  const events = eventsOnHijri(d.hijri, d.weekday).filter((e) => !isWeekly(e.when));
  if (events.some((e) => !e.voluntaryFast)) return 'occasion';
  return events.length ? 'fast' : null;
}

/** The Hijri month as a 7-column grid: Hijri day large, the civil day small under it */
export default function MonthGrid({
  grid,
  selected,
  onSelect,
}: {
  grid: Grid;
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  const dots = useMemo(() => new Map(grid.days.map((d) => [d.iso, dotOf(d)])), [grid]);
  return (
    <div role="grid" aria-label={`${HIJRI_MONTHS[grid.month - 1]} ${grid.year}`} data-month-grid>
      <div role="row" className="grid grid-cols-7 gap-1 pb-1">
        {weekdayHeaders().map((w) => (
          <span key={w} role="columnheader" className="text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
            {w}
          </span>
        ))}
      </div>
      {grid.weeks.map((week, i) => (
        <div role="row" key={i} className="grid grid-cols-7 gap-1">
          {week.map((d, j) => {
            if (!d) return <span key={`b${j}`} role="gridcell" aria-hidden className="min-h-12" />;
            const [, gm, gd] = d.iso.split('-').map(Number);
            const isSel = d.iso === selected;
            const dot = dots.get(d.iso);
            return (
              <button
                key={d.iso}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-current={d.isToday ? 'date' : undefined}
                aria-label={`${d.hijri.day} ${HIJRI_MONTHS[d.hijri.month - 1]}, ${gd} ${SHORT_MONTHS[gm - 1]}${d.isToday ? ', today' : ''}`}
                onClick={() => onSelect(d.iso)}
                data-iso={d.iso}
                className={cn(
                  'pressable relative flex min-h-12 flex-col items-center justify-center rounded-xl py-1 leading-none transition-colors',
                  isSel ? 'bg-teal text-on-teal' : d.isToday ? 'bg-teal/10 text-teal ring-2 ring-teal' : 'text-foreground hover:bg-foreground/5',
                )}
              >
                <span className="text-base font-semibold tabular-nums">{d.hijri.day}</span>
                <span className={cn('mt-0.5 text-[10px] tabular-nums', isSel ? 'text-on-teal/80' : 'text-muted')}>
                  {gd === 1 || d.hijri.day === 1 ? `${gd} ${SHORT_MONTHS[gm - 1]}` : gd}
                </span>
                {dot && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full',
                      isSel ? 'bg-on-teal' : dot === 'occasion' ? 'bg-gold' : 'bg-teal/60',
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
