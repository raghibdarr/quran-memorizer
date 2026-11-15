'use client';

import { HIJRI_MONTHS } from '@/lib/hijri/convert';
import type { MonthGrid as Grid } from '@/lib/hijri/calendar';
import { weekdayLabels } from '@/lib/weekdays';
import type { DayMarks } from '@/lib/hijri/grid-marks';
import { cn } from '@/lib/cn';

/** The weekday of the grid's first column, read from its first full week */
function firstWeekday(grid: Grid): number {
  for (const week of grid.weeks) {
    const j = week.findIndex((d) => d);
    if (j >= 0) return (week[j]!.weekday - j + 7) % 7;
  }
  return 0;
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The Hijri month as a 7-column grid: Hijri day large, the civil day small under it, then the day's mark */
export default function MonthGrid({
  grid,
  marks,
  selected,
  onSelect,
}: {
  grid: Grid;
  marks: Map<string, DayMarks>;
  selected: string | null;
  onSelect: (iso: string) => void;
}) {
  return (
    <div role="grid" aria-label={`${HIJRI_MONTHS[grid.month - 1]} ${grid.year}`} data-month-grid>
      {/* minmax(0,1fr): columns never grow past a seventh, even at 200% text */}
      <div role="row" className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1 pb-1">
        {weekdayLabels(firstWeekday(grid)).map((w) => (
          <span key={w} role="columnheader" className="truncate text-center text-[min(0.6875rem,3.2vw)] font-semibold text-muted">
            {w}
          </span>
        ))}
      </div>
      {grid.weeks.map((week, i) => (
        <div role="row" key={i} className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-1">
          {week.map((d, j) => {
            if (!d) return <span key={`b${j}`} role="gridcell" aria-hidden className="min-h-14" />;
            const [, gm, gd] = d.iso.split('-').map(Number);
            const isSel = d.iso === selected;
            const { dot, bar } = marks.get(d.iso) ?? { dot: null, bar: null };
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
                data-dot={dot ?? undefined}
                data-bar={bar?.kind}
                className={cn(
                  'pressable relative flex min-h-14 flex-col items-center justify-center rounded-xl py-1 leading-none transition-colors',
                  isSel ? 'bg-teal text-on-teal' : d.isToday ? 'bg-teal/10 text-teal ring-2 ring-teal' : 'text-foreground hover:bg-foreground/5',
                )}
              >
                <span className="text-[min(1rem,4.6vw)] font-semibold tabular-nums">{d.hijri.day}</span>
                <span className={cn('mt-0.5 max-w-full truncate text-[min(0.625rem,2.9vw)] tabular-nums', isSel ? 'text-on-teal' : 'text-muted')}>
                  {gd === 1 || d.hijri.day === 1 ? `${gd} ${SHORT_MONTHS[gm - 1]}` : gd}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'mt-1 h-1.5 w-1.5 rounded-full',
                    !dot ? 'invisible' : isSel ? 'bg-on-teal' : dot === 'occasion' ? 'bg-gold' : 'bg-teal',
                  )}
                />
                {bar && (
                  <span
                    aria-hidden
                    className={cn(
                      'absolute bottom-1 h-0.5',
                      bar.start ? 'left-2 rounded-l-full' : j === 0 ? 'left-0' : '-left-0.5',
                      bar.end ? 'right-2 rounded-r-full' : j === 6 ? 'right-0' : '-right-0.5',
                      isSel ? 'bg-on-teal/70' : bar.kind === 'occasion' ? 'bg-gold/60' : 'bg-teal/60',
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
