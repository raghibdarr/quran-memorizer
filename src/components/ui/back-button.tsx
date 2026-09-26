'use client';

import { useAppBack } from '@/hooks/use-app-back';
import { cn } from '@/lib/cn';

/**
 * The one back control (M11b): pops the in-app history (so it agrees with the
 * hardware back button and edge swipe), else goes to `fallback` — the screen's
 * parent — with the pop animation. 44px hit area.
 */
export default function BackButton({ fallback, label = 'Back', className }: { fallback: string; label?: string; className?: string }) {
  const back = useAppBack(fallback);
  return (
    <button
      type="button"
      onClick={back}
      className={cn('-ml-2 flex min-h-11 items-center px-2 text-sm text-muted hover:text-foreground', className)}
    >
      &larr; {label}
    </button>
  );
}
