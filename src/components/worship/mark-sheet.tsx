'use client';

import BottomSheet from '@/components/ui/bottom-sheet';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { useWorshipStore, type PrayerMark } from '@/stores/worship-store';
import { TIME_LABELS, type PrayerName } from '@/types/prayer';
import { MARK_LABELS, TRACKER_COPY } from './copy';
import { dayLabel } from './dates';

const CHOICES: PrayerMark[] = ['ontime', 'late', 'missed'];

/** The long-press choices for one prayer: On time / Late / Missed / Clear */
export default function MarkSheet({
  open,
  onClose,
  iso,
  prayer,
}: {
  open: boolean;
  onClose: () => void;
  iso: string;
  prayer: PrayerName;
}) {
  const current = useWorshipStore((s) => s.prayers[iso]?.[prayer]?.s);
  const markPrayer = useWorshipStore((s) => s.markPrayer);
  const clearPrayer = useWorshipStore((s) => s.clearPrayer);

  const choose = (s: PrayerMark) => {
    haptic.selection();
    markPrayer(iso, prayer, s);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={`${TIME_LABELS[prayer]} · ${dayLabel(iso)}`}>
      <p className="text-sm text-muted">{TRACKER_COPY.sheetHint}</p>
      <div className="mt-4 flex flex-col gap-2" role="group" aria-label={TIME_LABELS[prayer]} data-mark-sheet={`${iso}:${prayer}`}>
        {CHOICES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => choose(s)}
            aria-pressed={current === s}
            className={cn(
              'pressable flex min-h-12 items-center justify-between rounded-xl px-4 text-left text-sm font-semibold',
              current === s ? 'bg-teal/10 text-teal' : 'bg-foreground/5 text-foreground',
            )}
          >
            <span className="flex items-center gap-3">
              <MarkDot mark={s} />
              {MARK_LABELS[s]}
            </span>
            {current === s && <CheckIcon size={16} />}
          </button>
        ))}
        {current && (
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              clearPrayer(iso, prayer);
              onClose();
            }}
            className="min-h-12 rounded-xl text-sm font-semibold text-muted hover:text-foreground"
          >
            {TRACKER_COPY.clear}
          </button>
        )}
      </div>
    </BottomSheet>
  );
}

/** The small colour key for a mark: teal on time, gold late, a quiet ring for missed (never red) */
export function MarkDot({ mark, className }: { mark: PrayerMark | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-block h-3 w-3 shrink-0 rounded-full',
        mark === 'ontime' && 'bg-teal',
        mark === 'late' && 'bg-gold',
        mark === 'missed' && 'border-[1.5px] border-muted/70',
        !mark && 'bg-foreground/10',
        className,
      )}
    />
  );
}
