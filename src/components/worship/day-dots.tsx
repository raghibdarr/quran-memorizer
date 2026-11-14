import { cn } from '@/lib/cn';
import type { DayLog } from '@/lib/worship/log';
import { PRAYER_NAMES } from '@/types/prayer';

/**
 * Five small dots for one day, Fajr to Isha: teal on time, gold late, a quiet
 * ring for missed, faint for not logged. A paused day is a short line instead.
 */
export default function DayDots({ day, paused, className }: { day: DayLog | undefined; paused?: boolean; className?: string }) {
  if (paused) {
    return <span aria-hidden className={cn('block h-[1.5px] w-5 rounded-full bg-foreground/25', className)} data-paused />;
  }
  return (
    <span aria-hidden className={cn('flex items-center gap-[2px]', className)}>
      {PRAYER_NAMES.map((p) => {
        const s = day?.[p]?.s;
        return (
          <span
            key={p}
            className={cn(
              'block h-[5px] w-[5px] rounded-full',
              s === 'ontime' && 'bg-teal',
              s === 'late' && 'bg-gold',
              s === 'missed' && 'border border-muted/60',
              !s && 'bg-foreground/10',
            )}
          />
        );
      })}
    </span>
  );
}
