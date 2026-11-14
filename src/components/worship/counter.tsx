'use client';

import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { TASBIH_COPY } from './copy';

export interface CounterProps {
  /** The current count (the caller owns it) */
  count: number;
  /** Where the count is heading; 0 or absent for a free count */
  target?: number;
  /** One tap: the caller adds one */
  onCount: () => void;
  /** Takes one back; the Undo control shows only when this is given and count > 0 */
  onUndo?: () => void;
  /** What is being counted ("SubhanAllah"), read out with the count */
  label?: string;
}

/**
 * The tasbih counter (all-in-one spec 2.2): the whole area is one tap target
 * that counts. A light haptic lands on each count and a single stronger one when
 * the target is reached; counting carries on past it. The adhkar package reuses
 * this, so the props stay exactly as they are.
 *
 * It fills its parent: give the parent the height the counter should have.
 */
export function Counter({ count, target, onCount, onUndo, label }: CounterProps) {
  const goal = target && target > 0 ? Math.floor(target) : 0;
  const reached = goal > 0 && count >= goal;
  const progress = goal > 0 ? Math.min(1, count / goal) : 0;

  const tap = () => {
    // Fire for the count this tap makes, before the parent re-renders
    if (goal > 0 && count + 1 === goal) haptic.success();
    else haptic.selection();
    onCount();
  };

  const spoken = `${label ? `${label}: ` : ''}${TASBIH_COPY.countOf(count, goal || undefined)}`;

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3" data-counter>
      <button
        type="button"
        onClick={tap}
        aria-label={spoken}
        data-count={count}
        data-reached={reached || undefined}
        className={cn(
          'tactile-btn relative flex min-h-56 w-full flex-1 select-none flex-col items-center justify-center overflow-hidden rounded-3xl',
          'touch-manipulation [-webkit-tap-highlight-color:transparent]',
          reached ? 'bg-teal text-on-teal' : 'bg-card text-foreground',
        )}
      >
        {/* Progress towards the target as a quiet ring */}
        {goal > 0 && (
          <svg viewBox="0 0 120 120" className="pointer-events-none absolute h-[min(72%,15rem)] w-auto opacity-90" aria-hidden>
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="3" className={reached ? 'stroke-on-teal/25' : 'stroke-foreground/10'} />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              strokeWidth="3"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={`${progress} 1`}
              transform="rotate(-90 60 60)"
              className={cn('transition-[stroke-dasharray] duration-200 motion-reduce:transition-none', reached ? 'stroke-on-teal' : 'stroke-teal')}
            />
          </svg>
        )}
        <span className="relative text-6xl font-bold tabular-nums" aria-hidden>
          {count}
        </span>
        {goal > 0 && (
          <span className={cn('relative mt-1 text-sm tabular-nums', reached ? 'text-on-teal/80' : 'text-muted')} aria-hidden>
            of {goal}
          </span>
        )}
        <span aria-live="polite" className="sr-only">
          {reached && count === goal ? TASBIH_COPY.reachedTarget : ''}
        </span>
      </button>

      <div className="flex min-h-11 items-center justify-between gap-3 px-1 text-sm">
        <span className="text-xs text-muted">{reached ? TASBIH_COPY.reachedTarget : TASBIH_COPY.tapHint}</span>
        {onUndo && count > 0 && (
          <button type="button" onClick={onUndo} className="-mr-2 min-h-11 shrink-0 px-2 font-semibold text-teal">
            {TASBIH_COPY.undo}
          </button>
        )}
      </div>
    </div>
  );
}

export default Counter;
