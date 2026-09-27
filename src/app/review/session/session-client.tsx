'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LessonReviewCard } from '@/types/quran';
import { useReviewStore } from '@/stores/review-store';
import { useReviewQueue } from '@/hooks/use-review-queue';
import { useAppBack } from '@/hooks/use-app-back';
import { useContinueToday } from '@/hooks/use-today-run';
import ReviewSession from '@/components/review/review-session';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import CloseButton from '@/components/ui/close-button';

type Frozen = { cards: LessonReviewCard[]; early: ReadonlySet<string> };

/**
 * A review session as its own SCREEN (M11b): it has a history entry, so back —
 * button, hardware or swipe — closes it, and it can be deep-linked.
 *   ?stream=sabqi|manzil   one stream of today's queue (default: the whole queue)
 *   ?surah=<id>            that surah's due lessons
 *   ?lesson=<lessonId>     one hand-picked lesson (a deliberate review, due or not)
 *   ?from=plan             exit returns to Home instead of the Review dashboard
 */
export default function ReviewSessionScreen() {
  const params = useSearchParams();
  const queue = useReviewQueue();
  const lessonCards = useReviewStore((s) => s.lessonCards);
  const fromParam = params.get('from');
  const exitHref = fromParam === 'plan' || fromParam === 'today' ? '/' : '/review';
  const exit = useAppBack(exitHref);
  const continueToday = useContinueToday();

  // Frozen on first render: ratings update the stores during the session, and the
  // session must not reshuffle (or shrink) underneath the user
  const [frozen] = useState<Frozen>(() => {
    const lessonId = params.get('lesson');
    if (lessonId) {
      const card = lessonCards.find((c) => c.lessonId === lessonId);
      return { cards: card ? [card] : [], early: new Set() };
    }
    const stream = params.get('stream');
    const surah = Number(params.get('surah'));
    let cards = stream === 'sabqi' ? queue.sabqi : stream === 'manzil' ? queue.manzil : [...queue.sabqi, ...queue.manzil];
    if (surah) cards = cards.filter((c) => c.surahId === surah);
    return { cards, early: new Set(queue.earlyIds) };
  });

  return (
    <div className="min-h-dvh bg-cream pb-8">
      <div className="sticky top-[var(--safe-top)] z-10 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback={exitHref} label="Close review" />
          <span className="text-sm font-semibold text-teal">Review Session</span>
          <div className="flex items-center gap-2">
            <SettingsPanel />
            <UserButton />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {frozen.cards.length > 0 ? (
          <ReviewSession dueCards={frozen.cards} earlyIds={frozen.early} onComplete={fromParam === 'today' ? continueToday : exit} />
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm font-semibold text-foreground">Nothing to review here right now</p>
            <button onClick={exit} className="mt-4 text-sm font-semibold text-teal">Back</button>
          </div>
        )}
      </main>
    </div>
  );
}
