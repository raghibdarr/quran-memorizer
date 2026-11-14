'use client';

import { useState } from 'react';
import { firstLetters } from '@/lib/first-letters';
import { cn } from '@/lib/cn';
import { arabicWords } from './text';

/**
 * Arabic shown as first-letter cues (hide-words recall, as in the Quran
 * lessons): each word shows its opening letter; tap a word to see it whole.
 */
export function CueText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const words = arabicWords(text);
  return (
    <div dir="rtl" lang="ar" className={cn('flex flex-wrap justify-center gap-x-3 gap-y-2 text-3xl leading-loose', className)} data-cue-text>
      {words.map((w, i) => {
        const open = shown.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => setShown((prev) => new Set(prev).add(i))}
            aria-label={open ? undefined : `Show word ${i + 1}`}
            className={cn('rounded-lg px-1.5 transition-colors', open ? '' : 'bg-foreground/[0.05] hover:bg-foreground/10')}
          >
            <span className={cn('arabic-text', !open && 'text-muted')}>{open ? w : firstLetters(w)}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Plain Arabic for an item (not an ayah: those render from the surah files) */
export function ItemArabic({ text, className }: { text: string; className?: string }) {
  return (
    <p dir="rtl" lang="ar" className={cn('arabic-text text-[1.65rem] text-foreground', className)} style={{ textAlign: 'center' }}>
      {text}
    </p>
  );
}
