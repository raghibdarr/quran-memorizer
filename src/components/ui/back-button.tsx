'use client';

import { useEffect, useState } from 'react';
import { useAppBack } from '@/hooks/use-app-back';
import { previousEntry } from '@/lib/nav-history';
import { backLabelFor } from '@/lib/back-label';
import { getSurahIndex } from '@/lib/quran-data';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const surahName = async (id: number) => (await getSurahIndex()).find((s) => s.id === id)?.nameSimple;

/**
 * The one back control for drill-down screens (M11b): pops the in-app history
 * (so it agrees with the hardware back button and edge swipe), else goes to
 * `fallback` — the screen's parent — with the pop animation. Labelled with the
 * screen it returns to. Full-screen tasks use CloseButton instead.
 */
export default function BackButton({ fallback, className }: { fallback: string; className?: string }) {
  const back = useAppBack(fallback);
  const [label, setLabel] = useState('Back');

  useEffect(() => {
    let live = true;
    // After a tick: the history tracker (an ancestor) records this screen in its
    // own effect, which runs after this one
    const t = setTimeout(() => {
      backLabelFor(previousEntry() ?? fallback, surahName).then((l) => live && setLabel(l));
    }, 0);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [fallback]);

  return (
    <button
      type="button"
      onClick={back}
      aria-label={label === 'Back' ? 'Back' : `Back to ${label}`}
      className={cn('-ml-2 flex min-h-11 max-w-[9.5rem] items-center gap-0.5 pr-2 pl-1 text-sm text-muted hover:text-foreground', className)}
    >
      <ChevronLeftIcon size={18} className="shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
