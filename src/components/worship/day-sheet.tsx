'use client';

import BottomSheet from '@/components/ui/bottom-sheet';
import { cn } from '@/lib/cn';
import { haptic } from '@/lib/haptics';
import { isPaused } from '@/lib/worship/log';
import { useWorshipStore, type PrayerMark } from '@/stores/worship-store';
import { PRAYER_NAMES, TIME_LABELS } from '@/types/prayer';
import { MARK_LABELS, TRACKER_COPY } from './copy';
import { dayLabel } from './dates';

const CHOICES: PrayerMark[] = ['ontime', 'late', 'missed'];

/** Fill in a whole day from the month: each prayer On time / Late / Missed; tap the chosen one again to clear it */
export default function DaySheet({ iso, open, onClose }: { iso: string | null; open: boolean; onClose: () => void }) {
  const day = useWorshipStore((s) => (iso ? s.prayers[iso] : undefined));
  const paused = useWorshipStore((s) => (iso ? isPaused(iso, s.pauses) : false));
  const markPrayer = useWorshipStore((s) => s.markPrayer);
  const clearPrayer = useWorshipStore((s) => s.clearPrayer);

  return (
    <BottomSheet open={open && iso !== null} onClose={onClose} title={iso ? dayLabel(iso) : ''} doneButton>
      {iso && (
        <div data-day-sheet={iso}>
          <p className="text-sm text-muted">{paused ? TRACKER_COPY.dayPaused : TRACKER_COPY.dayHint}</p>
          <ul className="mt-4 divide-y divide-foreground/5">
            {PRAYER_NAMES.map((p) => {
              const current = day?.[p]?.s;
              return (
                <li key={p} className="flex items-center justify-between gap-2 py-2">
                  <span className="text-sm font-semibold text-foreground">{TIME_LABELS[p]}</span>
                  <span className="flex gap-1.5" role="group" aria-label={TIME_LABELS[p]}>
                    {CHOICES.map((s) => {
                      const on = current === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          data-choice={`${p}:${s}`}
                          onClick={() => {
                            haptic.selection();
                            if (on) clearPrayer(iso, p);
                            else markPrayer(iso, p, s);
                          }}
                          className={cn(
                            'pressable min-h-11 rounded-full px-3 text-xs font-semibold',
                            on && s === 'ontime' && 'bg-teal text-on-teal',
                            on && s === 'late' && 'bg-gold text-on-gold',
                            on && s === 'missed' && 'bg-foreground/15 text-foreground',
                            !on && 'bg-foreground/5 text-muted',
                          )}
                        >
                          {MARK_LABELS[s]}
                        </button>
                      );
                    })}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </BottomSheet>
  );
}
