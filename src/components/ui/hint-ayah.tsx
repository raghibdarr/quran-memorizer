'use client';

import { useState } from 'react';
import type { Ayah } from '@/types/quran';
import { realWords } from '@/lib/segments';
import { firstLetters } from '@/lib/first-letters';
import { cn } from '@/lib/cn';
import WordText from './word-text';

/**
 * An ayah as first-letter cues (hide-words recall, M10). Each word shows only its
 * opening letter; tap a word to see it whole. `from`/`to` limit it to one part.
 */
export default function HintAyah({ ayah, from = 0, to, className }: { ayah: Ayah; from?: number; to?: number; className?: string }) {
  const [shown, setShown] = useState<Set<number>>(new Set());
  const words = realWords(ayah);
  const last = to ?? words.length - 1;
  return (
    <div dir="rtl" className={cn('flex flex-wrap justify-center gap-x-3 gap-y-2 text-3xl leading-loose', className)}>
      {words.slice(from, last + 1).map((w, k) => {
        const i = from + k;
        const open = shown.has(i);
        return (
          <button
            key={w.position}
            type="button"
            onClick={() => setShown((prev) => new Set(prev).add(i))}
            aria-label={open ? undefined : `Show word ${i + 1}`}
            className={cn('rounded-lg px-1.5 transition-colors', open ? '' : 'bg-foreground/[0.05] hover:bg-foreground/10')}
          >
            {open ? <WordText ayah={ayah} index={i} /> : <span className="arabic-text text-muted">{firstLetters(w.textUthmani)}</span>}
          </button>
        );
      })}
    </div>
  );
}
