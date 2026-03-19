'use client';

import { useState, useEffect, useMemo } from 'react';
import { useReviewStore } from '@/stores/review-store';
import { useProgressStore } from '@/stores/progress-store';
import { getSurahIndex, getJuzSegmentsForSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { computeSurahHealth } from '@/lib/review-helpers';
import type { SurahMeta, LessonDef } from '@/types/quran';
import type { SurahHealth, LessonHealth } from '@/lib/review-helpers';
import Card from '@/components/ui/card';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { StarIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

export default function ReviewPage() {
  const cards = useReviewStore((s) => s.cards);
  const [surahIndex, setSurahIndex] = useState<SurahMeta[]>([]);
  const [surahLessons, setSurahLessons] = useState<Record<number, LessonDef[]>>({});
  const [loading, setLoading] = useState(true);

  // Get unique surah IDs from review cards
  const surahIds = useMemo(() => {
    const ids = new Set(cards.map((c) => c.surahId));
    return [...ids].sort((a, b) => a - b);
  }, [cards]);

  // Load surah index and lessons for all surahs with cards
  useEffect(() => {
    getSurahIndex().then(async (index) => {
      setSurahIndex(index);

      const lessonsMap: Record<number, LessonDef[]> = {};
      for (const surahId of surahIds) {
        const surah = index.find((s) => s.id === surahId);
        if (!surah) continue;
        const juzSegs = await getJuzSegmentsForSurah(surahId);
        lessonsMap[surahId] = generateLessonsWithJuzBoundaries(surahId, surah.versesCount, juzSegs);
      }
      setSurahLessons(lessonsMap);
      setLoading(false);
    });
  }, [surahIds]);

  // Compute health for all surahs
  const surahHealths = useMemo(() => {
    return surahIds
      .map((id) => {
        const lessons = surahLessons[id];
        if (!lessons) return null;
        return computeSurahHealth(id, lessons, cards);
      })
      .filter(Boolean) as SurahHealth[];
  }, [surahIds, surahLessons, cards]);

  // Sort: needs attention first
  const sortedHealths = useMemo(() => {
    return [...surahHealths].sort((a, b) => {
      if (a.needsAttention && !b.needsAttention) return -1;
      if (!a.needsAttention && b.needsAttention) return 1;
      return (b.totalWeak + b.totalHesitant) - (a.totalWeak + a.totalHesitant);
    });
  }, [surahHealths]);

  const surahMap = useMemo(() => new Map(surahIndex.map((s) => [s.id, s])), [surahIndex]);

  const totalWeak = surahHealths.reduce((s, h) => s + h.totalWeak, 0);
  const totalHesitant = surahHealths.reduce((s, h) => s + h.totalHesitant, 0);
  const totalStrong = surahHealths.reduce((s, h) => s + h.totalStrong, 0);

  if (loading) return null;

  if (surahIds.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-4 pb-20">
        <StarIcon size={40} className="text-teal" />
        <h2 className="mt-4 text-xl font-bold text-foreground">No reviews yet</h2>
        <p className="mt-1 text-center text-muted">Complete lessons to build your review dashboard</p>
        <a href="/" className="mt-6 rounded-xl bg-teal px-6 py-3 font-semibold text-white">
          Start Learning
        </a>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-20">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <a href="/" className="text-sm text-muted hover:text-foreground">&larr; Back</a>
          <span className="text-sm font-semibold text-teal">Review</span>
          <SettingsPanel />
        </div>
      </div>

      <header className="px-4 pt-4 pb-4">
        <div className="mx-auto max-w-2xl">
          {/* Summary stats */}
          <div className="flex justify-center gap-6">
            <div className="text-center">
              <p className="text-lg font-bold text-success">{totalStrong}</p>
              <p className="text-[10px] text-muted">Strong</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-gold">{totalHesitant}</p>
              <p className="text-[10px] text-muted">Shaky</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-red-400">{totalWeak}</p>
              <p className="text-[10px] text-muted">Weak</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 space-y-4">
        {sortedHealths.map((surahHealth) => {
          const surah = surahMap.get(surahHealth.surahId);
          if (!surah) return null;

          return (
            <SurahHealthCard
              key={surahHealth.surahId}
              surah={surah}
              health={surahHealth}
            />
          );
        })}
      </main>

      <BottomNav />
    </div>
  );
}

function SurahHealthCard({ surah, health }: { surah: SurahMeta; health: SurahHealth }) {
  const [expanded, setExpanded] = useState(false);
  const progressLessons = useProgressStore((s) => s.lessons);

  const totalAyahs = health.totalStrong + health.totalHesitant + health.totalWeak + health.totalNotLearned;

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left"
      >
        <Card className={cn(
          'transition-all',
          health.needsAttention && 'border border-gold/20'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">{surah.nameSimple}</h3>
              <p className="text-xs text-muted">
                {health.lessons.length} lesson{health.lessons.length !== 1 ? 's' : ''}
                {health.totalWeak > 0 && <span className="text-red-400"> · {health.totalWeak} weak</span>}
                {health.totalHesitant > 0 && <span className="text-gold"> · {health.totalHesitant} shaky</span>}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="arabic-text text-lg text-muted">{surah.nameArabic}</span>
              <span className={cn('text-muted transition-transform text-xs', expanded && 'rotate-180')}>▼</span>
            </div>
          </div>

          {/* Health bar */}
          {totalAyahs > 0 && (
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-foreground/5">
              {health.totalStrong > 0 && (
                <div className="bg-success" style={{ width: `${(health.totalStrong / totalAyahs) * 100}%` }} />
              )}
              {health.totalHesitant > 0 && (
                <div className="bg-gold" style={{ width: `${(health.totalHesitant / totalAyahs) * 100}%` }} />
              )}
              {health.totalWeak > 0 && (
                <div className="bg-red-400" style={{ width: `${(health.totalWeak / totalAyahs) * 100}%` }} />
              )}
            </div>
          )}
        </Card>
      </button>

      {/* Expanded lesson list */}
      {expanded && (
        <div className="mt-2 space-y-1.5 pl-2">
          {health.lessons.map((lessonHealth) => {
            const hasIssues = lessonHealth.weakCount > 0 || lessonHealth.hesitantCount > 0;
            const allNotLearned = lessonHealth.notLearnedCount === lessonHealth.ayahs.length;
            const lessonTotal = lessonHealth.ayahs.length;
            const progress = progressLessons[lessonHealth.lesson.lessonId];
            const isLessonComplete = progress?.completedAt != null;

            // Build practice URL with flagged weak ayahs
            const weakAyahNumbers = lessonHealth.ayahs
              .filter((a) => a.health === 'weak' || a.health === 'shaky')
              .map((a) => a.ayahNumber);

            const practiceUrl = `/lesson/${surah.id}?tab=practice&reviewLesson=${lessonHealth.lesson.lessonNumber}`;

            return (
              <a
                key={lessonHealth.lesson.lessonId}
                href={practiceUrl}
                className={cn(
                  'flex items-center gap-3 rounded-xl p-3 transition-all',
                  hasIssues ? 'bg-card hover:shadow-md' :
                  allNotLearned ? 'bg-foreground/3 opacity-60' :
                  'bg-card hover:shadow-md'
                )}
              >
                {/* Lesson number */}
                <div className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  hasIssues ? 'bg-gold/20 text-gold' :
                  allNotLearned ? 'bg-foreground/10 text-muted' :
                  'bg-success/20 text-success'
                )}>
                  {lessonHealth.lesson.lessonNumber}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Lesson {lessonHealth.lesson.lessonNumber}
                    <span className="ml-1.5 font-normal text-muted">
                      Ayahs {lessonHealth.lesson.ayahStart}–{lessonHealth.lesson.ayahEnd}
                    </span>
                  </p>

                  {/* Mini health bar */}
                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-foreground/5">
                    {lessonHealth.strongCount > 0 && (
                      <div className="bg-success" style={{ width: `${(lessonHealth.strongCount / lessonTotal) * 100}%` }} />
                    )}
                    {lessonHealth.hesitantCount > 0 && (
                      <div className="bg-gold" style={{ width: `${(lessonHealth.hesitantCount / lessonTotal) * 100}%` }} />
                    )}
                    {lessonHealth.weakCount > 0 && (
                      <div className="bg-red-400" style={{ width: `${(lessonHealth.weakCount / lessonTotal) * 100}%` }} />
                    )}
                  </div>

                  {hasIssues && (
                    <p className="mt-0.5 text-[10px] text-muted">
                      {lessonHealth.weakCount > 0 && <span className="text-red-400">{lessonHealth.weakCount} weak</span>}
                      {lessonHealth.weakCount > 0 && lessonHealth.hesitantCount > 0 && ' · '}
                      {lessonHealth.hesitantCount > 0 && <span className="text-gold">{lessonHealth.hesitantCount} shaky</span>}
                    </p>
                  )}
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
