'use client';

import { useState } from 'react';
import { firstLetters } from '@/lib/first-letters';
import { cn } from '@/lib/cn';
import { arabicWords } from './text';

/**
 * Arabic shown as first-letter cues (hide-words recall, as in the Quran
 * lessons): each word shows its opening letter; tap a word to see it whole,
 * tap again to hide it. An opened word keeps the same box, so the line keeps
 * its rhythm.
 */
export function CueText({ text, className }: { text: string; className?: string }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const words = arabicWords(text);
  const toggle = (i: number) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div dir="rtl" lang="ar" className={cn('flex flex-wrap justify-center gap-x-2 gap-y-3 text-2xl leading-none', className)} data-cue-text>
      {words.map((w, i) => {
        const open = shown.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            aria-pressed={open}
            aria-label={open ? undefined : `Word ${i + 1}, hidden`}
            className={cn(
              'inline-flex min-h-11 min-w-10 items-center justify-center rounded-lg px-2 py-1.5 transition-colors motion-reduce:transition-none',
              open ? 'bg-teal/10 text-foreground' : 'bg-foreground/[0.06] text-foreground/70 hover:bg-foreground/10 dark:bg-foreground/10 dark:hover:bg-foreground/15',
            )}
          >
            <span className="arabic-text" style={{ lineHeight: 1.4 }}>
              {open ? w : firstLetters(w)}
            </span>
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
