'use client';

import { useRef, useState } from 'react';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { ASR_LABELS, METHODS, methodInfo } from '@/lib/prayer/methods';
import { TIME_LABELS, TIME_NAMES, type AsrMadhab, type MethodId, type TimeName } from '@/types/prayer';

/** One choice in a list of radio rows */
export function RadioRow({
  selected,
  onSelect,
  title,
  detail,
  testId,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  detail?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => {
        if (!selected) haptic.selection();
        onSelect();
      }}
      data-choice={testId}
      className={cn(
        'flex min-h-12 w-full items-start gap-3 px-4 py-3 text-left transition-colors',
        selected ? 'bg-teal/[0.07]' : 'hover:bg-foreground/[0.03]',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
          selected ? 'border-teal bg-teal text-on-teal' : 'border-foreground/25',
        )}
      >
        {selected && <CheckIcon size={12} />}
      </span>
      <span className="min-w-0">
        <span className={cn('block text-sm font-semibold', selected ? 'text-teal' : 'text-foreground')}>{title}</span>
        {detail && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{detail}</span>}
      </span>
    </button>
  );
}

/** A rounded group of rows */
export function RowGroup({ children, label, className }: { children: React.ReactNode; label?: string; className?: string }) {
  return (
    <div
      role={label ? 'radiogroup' : undefined}
      aria-label={label}
      className={cn('divide-y divide-foreground/5 overflow-hidden rounded-2xl border border-foreground/10 bg-card', className)}
    >
      {children}
    </div>
  );
}

/** The calculation methods as a radio list (custom angles only where they can be edited) */
export function MethodList({
  value,
  onChange,
  includeCustom = false,
}: {
  value: MethodId;
  onChange: (m: MethodId) => void;
  includeCustom?: boolean;
}) {
  return (
    <RowGroup label="Calculation method">
      {METHODS.filter((m) => includeCustom || m.id !== 'custom').map((m) => (
        <RadioRow key={m.id} selected={m.id === value} onSelect={() => onChange(m.id)} title={m.label} detail={m.about} testId={m.id} />
      ))}
    </RowGroup>
  );
}

/**
 * A choice shown as one summary card: the chosen option, a line about it, and
 * "Change", which opens the full list under it. Picking one closes the list
 * again and brings the card (and what it changed, above it) back into view.
 */
export function ChoiceCard({
  title,
  detail,
  open,
  onOpenChange,
  children,
  testId,
}: {
  title: string;
  detail?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="scroll-mt-32 rounded-2xl border border-foreground/10 bg-card px-4 py-3.5" data-choice-card={testId}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground" data-method-label={testId === 'method' ? true : undefined}>
              {title}
            </p>
            {detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>}
          </div>
          <button
            type="button"
            onClick={() => onOpenChange(!open)}
            aria-expanded={open}
            className="-my-1 -mr-1 min-h-9 shrink-0 rounded-lg px-2 text-sm font-semibold text-teal hover:bg-teal/5"
          >
            {open ? 'Close' : 'Change'}
          </button>
        </div>
      </div>
      {open && children}
    </div>
  );
}

/** Closes a ChoiceCard's list and scrolls the card back into view if the list had taken it off screen */
function useCloseAndReveal(setOpen: (o: boolean) => void) {
  const ref = useRef<HTMLDivElement>(null);
  return {
    ref,
    close: () => {
      setOpen(false);
      requestAnimationFrame(() => {
        const card = ref.current?.querySelector<HTMLElement>('[data-choice-card]');
        if (card && card.getBoundingClientRect().top < 0) card.scrollIntoView({ block: 'start' });
      });
    },
  };
}

/** The chosen method with its reason, and a way to pick another */
export function MethodChoice({
  value,
  onChange,
  reason,
  includeCustom = false,
}: {
  value: MethodId;
  onChange: (m: MethodId) => void;
  /** Why this one was suggested (region default) */
  reason?: string;
  includeCustom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { ref, close } = useCloseAndReveal(setOpen);
  const info = methodInfo(value);
  return (
    <div ref={ref}>
      <ChoiceCard title={info.label} detail={reason ?? info.about} open={open} onOpenChange={setOpen} testId="method">
        <MethodList
          value={value}
          includeCustom={includeCustom}
          onChange={(m) => {
            onChange(m);
            close();
          }}
        />
      </ChoiceCard>
    </div>
  );
}

/** A ChoiceCard over a radio list, closing once something is picked */
export function ListChoice<T extends string>({
  value,
  options,
  onChange,
  label,
  defaultOpen = false,
  testPrefix,
}: {
  value: T;
  options: ReadonlyArray<{ id: T; title: string; detail: string }>;
  onChange: (v: T) => void;
  /** The group's name, for screen readers */
  label: string;
  defaultOpen?: boolean;
  testPrefix: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { ref, close } = useCloseAndReveal(setOpen);
  const chosen = options.find((o) => o.id === value) ?? options[0];
  return (
    <div ref={ref}>
      <ChoiceCard title={chosen.title} detail={chosen.detail} open={open} onOpenChange={setOpen} testId={testPrefix}>
        <RowGroup label={label}>
          {options.map((o) => (
            <RadioRow
              key={o.id}
              selected={o.id === value}
              onSelect={() => {
                onChange(o.id);
                close();
              }}
              title={o.title}
              detail={o.detail}
              testId={`${testPrefix}-${o.id}`}
            />
          ))}
        </RowGroup>
      </ChoiceCard>
    </div>
  );
}

const ASR_DETAIL: Record<AsrMadhab, string> = {
  standard: 'Asr begins when a shadow is as long as the thing casting it, plus its noon shadow.',
  hanafi: 'Asr begins when a shadow is twice as long as the thing casting it, plus its noon shadow. Later in the afternoon.',
};

/** Standard or Hanafi Asr */
export function AsrChoice({ value, onChange }: { value: AsrMadhab; onChange: (m: AsrMadhab) => void }) {
  return (
    <RowGroup label="Asr time">
      {(['standard', 'hanafi'] as const).map((m) => (
        <RadioRow key={m} selected={value === m} onSelect={() => onChange(m)} title={ASR_LABELS[m]} detail={ASR_DETAIL[m]} testId={`asr-${m}`} />
      ))}
    </RowGroup>
  );
}

/** The day's six times in a compact grid (a preview while choosing) */
export function TimesPreview({
  times,
  format,
  className,
}: {
  times: Record<TimeName, number | null> | null;
  format: (ms: number) => string;
  className?: string;
}) {
  return (
    <dl className={cn('grid grid-cols-3 gap-x-2 gap-y-2.5 rounded-2xl border border-foreground/10 bg-card px-4 py-3.5', className)} data-times-preview>
      {TIME_NAMES.map((t) => (
        <div key={t} className="min-w-0">
          <dt className="text-[11px] font-medium text-muted">{TIME_LABELS[t]}</dt>
          <dd className="text-sm font-semibold tabular-nums text-foreground">{times ? (times[t] === null ? '–' : format(times[t]!)) : ' '}</dd>
        </div>
      ))}
    </dl>
  );
}

/** − value + for a small number */
export function Stepper({
  value,
  onChange,
  min,
  max,
  format,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  format: (n: number) => string;
  /** What the number is, for screen readers */
  label: string;
}) {
  const btn =
    // 36px to the eye, 44px to the finger
    'pressable relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/[0.06] text-foreground after:absolute after:-inset-1 disabled:opacity-30';
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Less: ${label}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      {/* Teal once changed, so the adjusted ones stand out in a list */}
      <span
        className={cn('min-w-14 text-center text-sm tabular-nums', value === 0 ? 'font-medium text-muted' : 'font-semibold text-teal')}
        aria-live="polite"
        data-stepper-value
      >
        {format(value)}
      </span>
      <button type="button" className={btn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More: ${label}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <line x1="5" y1="12" x2="19" y2="12" />
          <line x1="12" y1="5" x2="12" y2="19" />
        </svg>
      </button>
    </div>
  );
}

/** A labelled on/off switch row */
export function SwitchRow({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail?: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        {detail && <p className="mt-0.5 text-xs leading-relaxed text-muted">{detail}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors', checked ? 'bg-teal' : 'bg-foreground/20')}
      >
        <span
          className={cn(
            'block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.45,.64,1)] motion-reduce:transition-none',
            checked ? 'translate-x-5.5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}
