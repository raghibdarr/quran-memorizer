import { ITEM_STATE_LABEL, type ItemState } from '@/components/deen/item-state';
import { cn } from '@/lib/cn';

const TONE: Record<ItemState, string> = {
  new: 'bg-foreground/[0.05] text-muted',
  learning: 'bg-teal/10 text-teal',
  due: 'bg-gold/15 text-gold-deep',
  strong: 'bg-success/10 text-success',
};

/** Where the learner is with one hadith: Not started, Learning, Due today, Strong */
export function StateChip({ state, className }: { state: ItemState; className?: string }) {
  return (
    <span
      className={cn('inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold', TONE[state], className)}
      data-item-state={state}
    >
      {ITEM_STATE_LABEL[state]}
    </span>
  );
}
