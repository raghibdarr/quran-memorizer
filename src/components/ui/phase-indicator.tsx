'use client';

import { cn } from '@/lib/cn';
import { CheckIcon } from '@/components/ui/icons';
import type { LessonPhase } from '@/types/quran';

const PHASES: { key: LessonPhase; label: string }[] = [
  { key: 'listen', label: 'Listen' },
  { key: 'understand', label: 'Understand' },
  { key: 'chunk', label: 'Build' },
  { key: 'test', label: 'Test' },
  { key: 'complete', label: 'Done' },
];

interface PhaseIndicatorProps {
  currentPhase: LessonPhase;
  onPhaseClick?: (phase: LessonPhase) => void;
}

export default function PhaseIndicator({ currentPhase, onPhaseClick }: PhaseIndicatorProps) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);

  const prevPhase = currentIndex > 0 ? PHASES[currentIndex - 1] : null;

  return (
    <div className="flex items-center justify-center">
      <div className="relative flex items-center gap-0">
        {/* Prev phase arrow — sits just left of the first circle */}
        {prevPhase && onPhaseClick && (
          <button
            onClick={() => onPhaseClick(prevPhase.key)}
            className="absolute -left-8 flex h-7 w-7 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
            title={`Back to ${prevPhase.label}`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
        )}
      {PHASES.map((phase, i) => {
        const isActive = i === currentIndex;
        const isComplete = i < currentIndex;
        const canClick = isComplete && onPhaseClick;

        return (
          <div key={phase.key} className="flex items-center">
            <button
              onClick={() => canClick && onPhaseClick(phase.key)}
              disabled={!canClick}
              className={cn('flex flex-col items-center w-14', canClick && 'cursor-pointer')}
            >
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isComplete && 'bg-success text-white',
                  isActive && 'bg-teal text-white',
                  !isComplete && !isActive && 'bg-foreground/10 text-muted',
                  canClick && 'hover:ring-2 hover:ring-success/50'
                )}
              >
                {isComplete ? <CheckIcon size={12} /> : i + 1}
              </div>
              <span
                className={cn(
                  'mt-1 text-[10px]',
                  isActive ? 'font-semibold text-teal' : 'text-muted'
                )}
              >
                {phase.label}
              </span>
            </button>
            {i < PHASES.length - 1 && (
              <div
                className={cn(
                  'h-0.5 w-3 -mx-1.5',
                  i < currentIndex ? 'bg-success' : 'bg-foreground/10'
                )}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
