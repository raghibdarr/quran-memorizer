'use client';

import { useMemo } from 'react';
import Card from '@/components/ui/card';
import { upcoming } from '@/lib/upcoming';
import { isoToDateUTC } from '@/lib/dates';
import { useReviewStore } from '@/stores/review-store';

/**
 * The next week of reviews (roadmap #15): what falls due each day, so the queue
 * is never a surprise. Counts are what's due; a session caps how many it serves.
 */
export default function ComingUp() {
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const cards = useReviewStore((s) => s.cards);
  const days = useMemo(() => upcoming(lessonCards, cards), [lessonCards, cards]);
  if (!lessonCards.length && !cards.length) return null;
  const max = Math.max(1, ...days.map((d) => d.lessons + d.ayahs));
  const label = (iso: string, i: number) =>
    i === 0 ? 'Today' : i === 1 ? 'Tmrw' : isoToDateUTC(iso).toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' });

  return (
    <Card className="hover:brightness-100 dark:hover:brightness-100" data-coming-up>
      <p className="text-sm font-bold text-foreground">Coming up</p>
      <p className="mt-0.5 text-xs text-muted">Reviews falling due over the next week.</p>
      <div className="mt-3 flex items-end gap-1.5" role="list">
        {days.map((d, i) => {
          const n = d.lessons + d.ayahs;
          return (
            <div key={d.iso} className="flex flex-1 flex-col items-center gap-1" role="listitem" aria-label={`${label(d.iso, i)}: ${d.lessons} lesson and ${d.ayahs} ayah reviews`}>
              <span className="text-[10px] tabular-nums text-muted">{n || ''}</span>
              <div className="flex h-16 w-full items-end">
                <div className="w-full rounded-t bg-teal/70" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0 }} />
              </div>
              <span className="text-[10px] text-muted">{label(d.iso, i)}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
