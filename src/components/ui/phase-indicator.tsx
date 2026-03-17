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
}

export default function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIndex = PHASES.findIndex((p) => p.key === currentPhase);

  return (
    <div className="flex items-center justify-center gap-0">
      {PHASES.map((phase, i) => {
        const isActive = i === currentIndex;
        const isComplete = i < currentIndex;

        return (
          <div key={phase.key} className="flex items-center">
            <div className="flex flex-col items-center w-14">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  isComplete && 'bg-success text-white',
                  isActive && 'bg-teal text-white',
                  !isComplete && !isActive && 'bg-foreground/10 text-muted'
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
            </div>
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
  );
}
