'use client';

import { cn } from '@/lib/cn';

interface BeadProgressProps {
  total: number;
  filled: number;
  /** Ring-highlight the next bead in line (the one being worked on). */
  showCurrent?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZES = {
  sm: { bead: 'h-2.5 w-2.5', current: 'h-3 w-3', gap: 'gap-1.5' },
  md: { bead: 'h-3 w-3', current: 'h-3.5 w-3.5', gap: 'gap-2' },
};

/**
 * Tasbih-bead progress: a row of beads that fill as you go.
 * Falls back to a segmented bar when there are too many beads to read.
 */
export default function BeadProgress({
  total,
  filled,
  showCurrent = false,
  size = 'md',
  className,
}: BeadProgressProps) {
  const clamped = Math.max(0, Math.min(filled, total));

  if (total > 10) {
    const pct = total > 0 ? (clamped / total) * 100 : 0;
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-foreground/15 bg-foreground/5">
          <div
            className="h-full rounded-full bg-teal transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums text-muted">
          {clamped}/{total}
        </span>
      </div>
    );
  }

  const s = SIZES[size];

  return (
    <div className={cn('flex items-center justify-center', s.gap, className)} role="img" aria-label={`${clamped} of ${total} complete`}>
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < clamped;
        const isCurrent = showCurrent && i === clamped;
        return (
          <span
            key={`${i}-${isFilled}`}
            className={cn(
              'rounded-full',
              isCurrent ? s.current : s.bead,
              isFilled && 'bg-teal animate-[bead-pop_300ms_ease-out]',
              !isFilled && isCurrent && 'border-[1.5px] border-gold bg-gold/15',
              !isFilled && !isCurrent && 'border-[1.5px] border-foreground/25'
            )}
          />
        );
      })}
    </div>
  );
}
