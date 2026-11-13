'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { parseAmount } from '@/lib/zakat/format';

/**
 * An amount field. Keeps the text the user is typing ("12." stays "12.") and
 * hands the parent a number, or null when empty. Mounted only after the store
 * has hydrated, so its first value is the remembered one.
 */
export function AmountField({
  label,
  hint,
  value,
  onChange,
  unit,
  testId,
}: {
  label: string;
  hint?: string;
  value: number | undefined | null;
  onChange: (n: number | null) => void;
  /** Shown after the box: "g", or the currency */
  unit?: string;
  testId?: string;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined || value === null ? '' : String(value));
  const parsed = parseAmount(text);
  const invalid = Number.isNaN(parsed);
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="0"
          value={text}
          aria-invalid={invalid || undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseAmount(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className={cn(
            'w-full min-w-0 rounded-xl border bg-card px-3.5 py-2.5 text-base tabular-nums text-foreground',
            'focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20',
            invalid ? 'border-gold-deep/60' : 'border-foreground/15',
          )}
        />
        {unit && <span className="shrink-0 text-sm text-muted">{unit}</span>}
      </div>
      {invalid && <p className="mt-1 text-xs text-gold-deep">Numbers only, like 1250.50</p>}
    </div>
  );
}

/**
 * A choice between positions where nothing is picked until the user picks
 * (unlike SegmentedControl, which always has a selection).
 */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  name,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="mt-3 flex flex-wrap gap-2" data-choice={name}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (!on) haptic.selection();
              onChange(o.value);
            }}
            className={cn(
              'tactile-chip min-h-11 flex-1 rounded-xl border px-3 py-2 text-sm font-semibold',
              on ? 'border-teal bg-teal text-on-teal' : 'border-foreground/15 bg-card text-foreground hover:bg-foreground/5',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', on ? 'bg-teal' : 'bg-foreground/20')}
    >
      <span
        className={cn(
          'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.45,.64,1)] motion-reduce:transition-none',
          on ? 'translate-x-5.5' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

/** A section heading inside the page, sentence case */
export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="px-1 pt-4 text-base font-bold text-foreground">
      {children}
    </h2>
  );
}
