import { cn } from '@/lib/cn';
import type { DayLog } from '@/lib/worship/log';
import { PRAYER_NAMES } from '@/types/prayer';

/**
 * Five small dots for one day, Fajr to Isha: teal on time, gold late, a quiet
 * ring for missed, faint for not logged. A paused day is a short line instead.
 * `sm` suits the dense month grid; `md` the week strip, where the dots are the
 * card's whole content (6px at 375px so the days stay apart, 8px from the sm
 * breakpoint). The mark keeps its own height: wrap it to centre it.
 */
export default function DayDots({ day, paused, size = 'sm' }: { day: DayLog | undefined; paused?: boolean; size?: 'sm' | 'md' }) {
  const md = size === 'md';
  if (paused) {
    return <span aria-hidden className={cn('block h-[1.5px] rounded-full bg-foreground/25', md ? 'w-6 sm:w-8' : 'w-5')} data-paused />;
  }
  return (
    <span aria-hidden className={cn('flex items-center', md ? 'gap-[1.5px] sm:gap-[3px]' : 'gap-[2px]')}>
      {PRAYER_NAMES.map((p) => {
        const s = day?.[p]?.s;
        return (
          <span
            key={p}
            className={cn(
              'block rounded-full',
              md ? 'h-1.5 w-1.5 sm:h-2 sm:w-2' : 'h-[5px] w-[5px]',
              s === 'ontime' && 'bg-teal',
              s === 'late' && 'bg-gold',
              s === 'missed' && (md ? 'border border-muted sm:border-[1.5px]' : 'border border-muted'),
              !s && 'bg-foreground/15',
            )}
          />
        );
      })}
    </span>
  );
}
