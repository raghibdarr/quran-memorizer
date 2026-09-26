'use client';

import { useAppBack } from '@/hooks/use-app-back';
import { XIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

/**
 * Leave a full-screen task (lesson, review session) and return to wherever it
 * was opened from — same destination as back, but reads as "close this task",
 * not "previous step". Progress is saved as it goes, so there's no confirm.
 */
export default function CloseButton({ fallback, label = 'Close', className }: { fallback: string; label?: string; className?: string }) {
  const close = useAppBack(fallback);
  return (
    <button
      type="button"
      onClick={close}
      aria-label={label}
      title={label}
      className={cn(
        'pressable -ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground',
        className,
      )}
    >
      <XIcon size={20} />
    </button>
  );
}
