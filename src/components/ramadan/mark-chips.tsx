'use client';

import { FAST_MARK_HINTS, FAST_MARK_LABELS } from '@/lib/worship/ramadan';
import type { FastMark } from '@/stores/worship-store';
import { cn } from '@/lib/cn';

const ON: Record<FastMark, string> = {
  fasted: 'bg-teal text-on-teal border-teal',
  owed: 'bg-gold/20 text-foreground border-gold',
  exempt: 'bg-foreground/10 text-foreground border-foreground/30',
};

/**
 * The marks a day can take, as toggle chips: tapping the chosen one again
 * clears the day. `labels` lets a voluntary-fast day say so.
 */
export default function MarkChips({
  options,
  value,
  onChange,
  labels,
  disabled,
}: {
  options: FastMark[];
  value: FastMark | undefined;
  onChange: (mark: FastMark | null) => void;
  labels?: Partial<Record<FastMark, string>>;
  disabled?: boolean;
}) {
  return (
    <div className={cn('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-1')} role="group" aria-label="Mark this day">
      {options.map((m) => {
        const on = value === m;
        return (
          <button
            key={m}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            title={FAST_MARK_HINTS[m]}
            onClick={() => onChange(on ? null : m)}
            data-mark={m}
            className={cn(
              'tactile-chip min-h-12 rounded-xl border px-2 text-sm font-semibold transition-colors disabled:opacity-40',
              on ? ON[m] : 'border-foreground/15 bg-card text-foreground',
            )}
          >
            {labels?.[m] ?? FAST_MARK_LABELS[m]}
          </button>
        );
      })}
    </div>
  );
}
