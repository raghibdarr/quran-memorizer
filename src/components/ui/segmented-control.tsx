'use client';

import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';

type Option<T extends string> = { value: T; label: string };

/**
 * Equal-width segmented toggle whose selected chip GLIDES between segments
 * (M11 accent 3) instead of jumping. Glide timing is the --dial-chip-* dials.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  chipClassName,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  /** extra classes for the selected chip (e.g. 'ink-border') */
  chipClassName?: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div
      role="tablist"
      className={cn('segmented relative flex gap-1 rounded-xl bg-foreground/5 p-1', className)}
      style={{ '--seg-n': options.length, '--seg-i': index } as CSSProperties}
    >
      <span aria-hidden className={cn('segmented-chip rounded-lg bg-teal', chipClassName)} />
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => {
            if (o.value !== value) haptic.selection();
            onChange(o.value);
          }}
          className={cn(
            'pressable relative z-[1] min-h-11 flex-1 rounded-lg py-2 text-sm font-semibold',
            o.value === value ? 'text-on-teal' : 'text-muted hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
