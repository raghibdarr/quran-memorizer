'use client';

import { useEffect, useId, useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { ambiguousReading, amountText, parseAmount } from '@/lib/zakat/format';

/**
 * The look every text, number and date box on the zakat page shares: a clear
 * teal edge when focused, and a gold edge while invalid that focus doesn't hide.
 * The colour-scheme follows the app's own dark class (not the OS), so native
 * date pickers and their icons match the page.
 */
export const inputClass = cn(
  'rounded-xl border border-foreground/15 bg-card px-3.5 py-2.5 text-base text-foreground',
  'focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/25',
  'aria-[invalid=true]:border-gold-deep aria-[invalid=true]:focus:border-gold-deep aria-[invalid=true]:focus:ring-gold/25',
  '[.dark_&]:[color-scheme:dark]',
);

/** Room on the right of the box for a unit of this many characters */
function unitPadding(unit: string): string {
  const n = [...unit].length;
  if (n <= 1) return 'pr-9';
  if (n === 2) return 'pr-11';
  if (n === 3) return 'pr-14';
  return 'pr-[35%]';
}

/** Shown under an amount that doesn't read as one */
function amountProblem(text: string): string {
  return /^\s*[-−‐-—]/.test(text) ? 'Enter an amount of 0 or more.' : 'Numbers only, like 1250.50';
}

/**
 * An amount field. Keeps the text the user is typing ("12." stays "12.") and
 * hands the parent a number, or null when empty. Mounted only after the store
 * has hydrated, so its first value is the remembered one.
 *
 * While the text doesn't read as an amount the store keeps its last good
 * number, so the field reports itself through onValidity and the result waits.
 */
export function AmountField({
  label,
  hint,
  value,
  onChange,
  unit,
  testId,
  inputId,
  onValidity,
}: {
  label: string;
  hint?: string;
  value: number | undefined | null;
  onChange: (n: number | null) => void;
  /** Shown inside the box on the right: "g", or the currency */
  unit?: string;
  testId?: string;
  /** A stable id for the input, so other parts of the page can bring it into view */
  inputId?: string;
  /** Called with this field's id and whether its text is currently unreadable */
  onValidity?: (id: string, invalid: boolean) => void;
}) {
  const autoId = useId();
  const id = inputId ?? autoId;
  const [text, setText] = useState(amountText(value));
  const parsed = parseAmount(text);
  const invalid = Number.isNaN(parsed);
  // "1,234" could be a thousand or a decimal: say which one was taken
  const readAs = invalid ? null : ambiguousReading(text);

  useEffect(() => {
    if (!onValidity) return;
    onValidity(id, invalid);
    return () => onValidity(id, false);
  }, [id, invalid, onValidity]);

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      <div className="relative mt-1.5">
        <input
          id={id}
          data-testid={testId}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="0"
          value={text}
          aria-invalid={invalid || undefined}
          aria-describedby={[hint ? `${id}-hint` : '', invalid ? `${id}-error` : '', readAs ? `${id}-read` : ''].filter(Boolean).join(' ') || undefined}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseAmount(e.target.value);
            if (!Number.isNaN(n)) onChange(n);
          }}
          className={cn(inputClass, 'w-full min-w-0 tabular-nums', unit && unitPadding(unit))}
        />
        {unit && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-3.5 flex max-w-[35%] items-center truncate text-sm text-muted"
          >
            {unit}
          </span>
        )}
      </div>
      {readAs && (
        <p id={`${id}-read`} className="mt-1.5 text-xs text-muted" data-testid={testId ? `${testId}-read` : undefined}>
          Read as {readAs}
          {unit ? ` ${unit}` : ''}
        </p>
      )}
      {invalid && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-gold-deep">
          {amountProblem(text)}
        </p>
      )}
    </div>
  );
}

/** The question above a set of ChoiceChips */
export function ChoiceQuestion({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-sm font-medium text-foreground">{children}</p>;
}

/**
 * A choice between positions where nothing is picked until the user picks
 * (unlike SegmentedControl, which always has a selection). Drawn flat, like the
 * nisab tiles, so it reads as a choice rather than a button that does something.
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
  // Radio-group keys: arrows move to the next choice and pick it. Until a
  // choice is made every option is a tab stop; afterwards only the chosen one.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    const radios = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const at = radios.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    const next = (at + step + radios.length) % radios.length;
    radios[next].focus();
    onChange(options[next].value);
  };
  return (
    <div role="radiogroup" aria-label={label} className="mt-2 flex flex-wrap gap-2" data-choice={name} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={value === null || on ? 0 : -1}
            onClick={() => {
              if (!on) haptic.selection();
              onChange(o.value);
            }}
            className={cn(
              'pressable inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              on ? 'border-teal bg-teal/10 text-teal' : 'border-foreground/15 bg-card text-foreground hover:bg-foreground/5',
            )}
          >
            {on && <CheckIcon size={14} className="shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The same switch as the settings panel: the thumb sits in the flow of the track */
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
      <div
        className={cn(
          'h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.45,.64,1)] motion-reduce:transition-none',
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
