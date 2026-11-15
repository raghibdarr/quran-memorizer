import { CheckIcon } from '@/components/ui/icons';
import type { ItemState } from '@/components/deen/item-state';
import { cn } from '@/lib/cn';

/**
 * Where the learner is with a Name, told by shape as well as colour: a hollow
 * gold ring while learning, a filled teal dot when due, a green check when strong.
 * Nothing for a Name not started.
 */
export function StateMark({ state, className }: { state: ItemState; className?: string }) {
  if (state === 'new') return null;
  if (state === 'strong') {
    return (
      <span aria-hidden className={cn('flex h-2 w-2 shrink-0 items-center justify-center text-success', className)}>
        <CheckIcon size={11} className="shrink-0" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn('block h-2 w-2 shrink-0 rounded-full', state === 'learning' ? 'border-[1.5px] border-gold-deep' : 'bg-teal', className)}
    />
  );
}
