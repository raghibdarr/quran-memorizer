'use client';

import { useId } from 'react';
import { FAST_MARK_HINT_NONE, FAST_MARK_HINTS, FAST_MARK_LABELS } from '@/lib/worship/ramadan';
import type { FastMark } from '@/stores/worship-store';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

// .tactile-chip draws the border, so the state is carried by fill and text
const ON: Record<FastMark, string> = {
  fasted: 'bg-teal text-on-teal',
  owed: 'bg-gold text-on-gold',
  exempt: 'bg-foreground/15 text-foreground',
};

/**
 * The marks a day can take, as toggle chips: tapping the chosen one again
 * clears the day. `labels` lets a voluntary-fast day say so. With more than
 * one choice, a line under the chips says what the chosen mark does.
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
  const hintId = useId();
  const showHint = options.length > 1;
  return (
    <div>
      <div
        className={cn('grid gap-2', options.length === 3 ? 'grid-cols-3' : 'grid-cols-1')}
        role="group"
        aria-label="Mark this day"
        aria-describedby={showHint ? hintId : undefined}
      >
        {options.map((m) => {
          const on = value === m;
          return (
            <button
              key={m}
              type="button"
              disabled={disabled}
              aria-pressed={on}
              onClick={() => onChange(on ? null : m)}
              data-mark={m}
              className={cn(
                'tactile-chip relative flex min-h-12 items-center justify-center rounded-xl px-2 text-sm font-semibold leading-tight text-balance transition-colors disabled:opacity-40',
                on ? ON[m] : 'bg-card text-foreground',
              )}
            >
              {on && <CheckIcon size={12} className="absolute top-1 right-1" />}
              <span>{labels?.[m] ?? FAST_MARK_LABELS[m]}</span>
            </button>
          );
        })}
      </div>
      {showHint && (
        <p id={hintId} className="mt-2 px-0.5 text-xs leading-snug text-muted" aria-live="polite" data-mark-hint>
          {value && options.includes(value) ? FAST_MARK_HINTS[value] : FAST_MARK_HINT_NONE}
        </p>
      )}
    </div>
  );
}
