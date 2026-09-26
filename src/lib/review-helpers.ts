import type { ReviewCard, LessonDef } from '@/types/quran';

/** 'unchecked' = has a card but was never rated (attested-known, or learned but not yet reviewed) —
 *  shown as such rather than guessed as a strength (persona test: known surahs read as "48 Shaky") */
export type AyahHealth = 'strong' | 'shaky' | 'weak' | 'unchecked' | 'not-learned';

export interface LessonHealth {
  lesson: LessonDef;
  ayahs: Array<{ ayahNumber: number; health: AyahHealth; quality: number }>;
  strongCount: number;
  hesitantCount: number;
  weakCount: number;
  uncheckedCount: number;
  notLearnedCount: number;
}

export interface SurahHealth {
  surahId: number;
  lessons: LessonHealth[];
  totalStrong: number;
  totalHesitant: number;
  totalWeak: number;
  totalUnchecked: number;
  totalNotLearned: number;
  needsAttention: boolean;
}

/** Map SM-2 quality score to health status */
export function qualityToHealth(quality: number): AyahHealth {
  if (quality >= 4) return 'strong';
  if (quality >= 3) return 'shaky';
  return 'weak';
}

/** Compute per-lesson health for a surah */
export function computeSurahHealth(
  surahId: number,
  lessons: LessonDef[],
  cards: ReviewCard[],
): SurahHealth {
  const surahCards = cards.filter((c) => c.surahId === surahId);
  const cardMap = new Map(surahCards.map((c) => [`${c.surahId}:${c.ayahNumber}`, c]));

  let totalStrong = 0;
  let totalHesitant = 0;
  let totalWeak = 0;
  let totalUnchecked = 0;
  let totalNotLearned = 0;

  const lessonHealths: LessonHealth[] = lessons.map((lesson) => {
    let strongCount = 0;
    let hesitantCount = 0;
    let weakCount = 0;
    let uncheckedCount = 0;
    let notLearnedCount = 0;

    const ayahs: LessonHealth['ayahs'] = [];

    for (let n = lesson.ayahStart; n <= lesson.ayahEnd; n++) {
      const card = cardMap.get(`${surahId}:${n}`);
      if (!card) {
        notLearnedCount++;
        totalNotLearned++;
        ayahs.push({ ayahNumber: n, health: 'not-learned', quality: -1 });
      } else if (card.lastReview === 0) {
        uncheckedCount++;
        totalUnchecked++;
        ayahs.push({ ayahNumber: n, health: 'unchecked', quality: card.lastQuality });
      } else {
        const health = qualityToHealth(card.lastQuality);
        ayahs.push({ ayahNumber: n, health, quality: card.lastQuality });
        if (health === 'strong') { strongCount++; totalStrong++; }
        else if (health === 'shaky') { hesitantCount++; totalHesitant++; }
        else { weakCount++; totalWeak++; }
      }
    }

    return { lesson, ayahs, strongCount, hesitantCount, weakCount, uncheckedCount, notLearnedCount };
  });

  return {
    surahId,
    lessons: lessonHealths,
    totalStrong,
    totalHesitant,
    totalWeak,
    totalUnchecked,
    totalNotLearned,
    needsAttention: totalWeak > 0 || totalHesitant > 0,
  };
}

/** Count lessons that need attention across all review cards */
export function countLessonsNeedingAttention(
  allLessons: Array<{ surahId: number; lessons: LessonDef[] }>,
  cards: ReviewCard[],
): number {
  let count = 0;
  for (const { surahId, lessons } of allLessons) {
    const health = computeSurahHealth(surahId, lessons, cards);
    count += health.lessons.filter((l) => l.weakCount > 0 || l.hesitantCount > 0).length;
  }
  return count;
}
