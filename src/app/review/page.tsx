'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReviewStore } from '@/stores/review-store';
import { useStatsStore } from '@/stores/stats-store';
import { getSurah } from '@/lib/quran-data';
import type { ReviewCard, Ayah } from '@/types/quran';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import SettingsPanel from '@/components/layout/settings-panel';
import { cn } from '@/lib/cn';

export default function ReviewPage() {
  const cards = useReviewStore((s) => s.cards);
  const reviewCardFn = useReviewStore((s) => s.reviewCard);
  const dueCards = useMemo(() => {
    const now = Date.now();
    return cards.filter((c) => c.nextReview <= now).sort((a, b) => a.nextReview - b.nextReview);
  }, [cards]);
  const { recordActivity } = useStatsStore();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [ayahData, setAyahData] = useState<{ card: ReviewCard; ayah: Ayah; surahName: string } | null>(null);
  const [done, setDone] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const currentCard = dueCards[currentIndex];

  useEffect(() => {
    if (!currentCard) {
      setDone(true);
      return;
    }
    loadAyah(currentCard);
  }, [currentIndex]);

  async function loadAyah(card: ReviewCard) {
    const surah = await getSurah(card.surahId);
    const ayah = surah.ayahs.find((a) => a.number === card.ayahNumber);
    if (ayah) {
      setAyahData({ card, ayah, surahName: surah.nameSimple });
    }
  }

  const handleRate = (quality: number) => {
    if (!currentCard) return;
    reviewCardFn(currentCard.surahId, currentCard.ayahNumber, quality);
    recordActivity();
    setReviewedCount((c) => c + 1);
    setRevealed(false);

    if (currentIndex < dueCards.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setDone(true);
    }
  };

  if (dueCards.length === 0 && !done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4">
        <div className="text-center">
          <p className="text-4xl">&#9734;</p>
          <h2 className="mt-4 text-xl font-bold text-foreground">All caught up!</h2>
          <p className="mt-1 text-muted">No reviews due right now. Keep learning!</p>
          <a href="/">
            <Button className="mt-6">Back to Home</Button>
          </a>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <span className="text-3xl">&#10003;</span>
          </div>
          <h2 className="mt-4 text-xl font-bold text-foreground">Review Complete!</h2>
          <p className="mt-1 text-muted">{reviewedCount} ayahs reviewed</p>
          <a href="/">
            <Button className="mt-6">Back to Home</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream">
      <header className="sticky top-0 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <a href="/" className="text-sm text-muted hover:text-foreground">
            ← Back
          </a>
          <span className="text-sm font-semibold text-teal">
            Review {currentIndex + 1} / {dueCards.length}
          </span>
          <SettingsPanel />
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-6">
        {ayahData && (
          <div className="space-y-6">
            {!revealed ? (
              <>
                <div className="rounded-2xl border-2 border-dashed border-foreground/20 p-8 text-center">
                  <p className="text-sm text-muted">{ayahData.surahName}</p>
                  <p className="mt-1 text-lg font-semibold text-foreground">
                    Ayah {ayahData.card.ayahNumber}
                  </p>
                  <p className="mt-4 text-sm text-muted">
                    Try to recite this ayah from memory
                  </p>
                </div>

                <Button onClick={() => setRevealed(true)} className="w-full">
                  Show Ayah
                </Button>
              </>
            ) : (
              <>
                <AyahDisplay ayah={ayahData.ayah} />

                <div className="space-y-2">
                  <p className="text-center text-sm font-medium text-foreground">
                    How well did you remember?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRate(1)}
                      className="flex-1 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
                    >
                      Forgot
                    </button>
                    <button
                      onClick={() => handleRate(3)}
                      className="flex-1 rounded-xl bg-amber-50 py-3 text-sm font-semibold text-amber-600 transition-colors hover:bg-amber-100"
                    >
                      Hard
                    </button>
                    <button
                      onClick={() => handleRate(5)}
                      className="flex-1 rounded-xl bg-green-50 py-3 text-sm font-semibold text-green-600 transition-colors hover:bg-green-100"
                    >
                      Easy
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
