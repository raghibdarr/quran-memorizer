'use client';

import type { DeckDepth } from '@/types/deen';
import { cn } from '@/lib/cn';

export const DEPTH_LABEL: Record<DeckDepth, { title: string; detail: string }> = {
  meaning: { title: 'Know the meaning', detail: 'Read it, understand it, and review what it means.' },
  arabic: { title: 'Memorise the Arabic', detail: 'Learn the words by heart, part by part, and review them.' },
};

/** The depth to use: the learner's choice for this deck, else the deck's default, else ask (null) */
export function resolveDepth(stored: DeckDepth | undefined, deckDefault: DeckDepth | null): DeckDepth | null {
  return stored ?? deckDefault ?? null;
}

/** "Know the meaning" or "Memorise the Arabic" (spec 2.7): asked once per deck when it has no default */
export function DepthChoice({ title, onChoose, value, className }: { title?: string; onChoose: (d: DeckDepth) => void; value?: DeckDepth | null; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} data-depth-choice>
      <div className="text-center">
        <h2 className="text-lg font-bold text-foreground">How would you like to learn {title ? title : 'these'}?</h2>
        <p className="mt-1 text-sm text-muted">Takrar keeps this choice for the whole collection.</p>
      </div>
      {(['arabic', 'meaning'] as const).map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChoose(d)}
          aria-pressed={value === d}
          className={cn(
            'pressable w-full rounded-2xl border-[1.5px] bg-card px-4 py-3.5 text-left',
            value === d ? 'border-teal bg-teal/5' : 'border-foreground/15 hover:border-foreground/30',
          )}
        >
          <span className="block text-sm font-bold text-foreground">{DEPTH_LABEL[d].title}</span>
          <span className="mt-0.5 block text-xs text-muted">{DEPTH_LABEL[d].detail}</span>
        </button>
      ))}
    </div>
  );
}

export default DepthChoice;
