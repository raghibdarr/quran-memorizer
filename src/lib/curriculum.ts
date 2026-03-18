import type { LessonDef } from '@/types/quran';

// All 114 surahs — Juz 30 first (short/familiar), then rest by traditional order
export const CURRICULUM_ORDER = [
  // Juz 30 — short surahs, ordered by familiarity/difficulty
  1,   // Al-Fatiha — everyone needs this
  112, 113, 114,  // Short, commonly memorized
  108, 103, 110, 111,  // Very short surahs
  109, 107, 106, 105, 104, 102, 101, 100, 99, 98, 97,  // Short surahs
  96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78,  // Longer Juz 30 surahs
  // Juz 29 (67-77)
  67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77,
  // Juz 28 (58-66)
  58, 59, 60, 61, 62, 63, 64, 65, 66,
  // Rest of Quran — traditional order
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
  38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54,
  55, 56, 57,
] as const;

const AYAHS_PER_LESSON = 5;

/** Generate lesson definitions for a surah */
export function generateLessons(surahId: number, versesCount: number): LessonDef[] {
  // Short surahs = single lesson
  if (versesCount <= 8) {
    return [{
      lessonId: `${surahId}-1`,
      surahId,
      lessonNumber: 1,
      ayahStart: 1,
      ayahEnd: versesCount,
      ayahCount: versesCount,
    }];
  }

  const lessons: LessonDef[] = [];
  let start = 1;
  let num = 1;

  while (start <= versesCount) {
    let end = Math.min(start + AYAHS_PER_LESSON - 1, versesCount);

    // Avoid orphan groups of 1-2 ayahs at the end
    const remaining = versesCount - end;
    if (remaining > 0 && remaining <= 2) {
      // Absorb the remaining into this lesson
      end = versesCount;
    }

    lessons.push({
      lessonId: `${surahId}-${num}`,
      surahId,
      lessonNumber: num,
      ayahStart: start,
      ayahEnd: end,
      ayahCount: end - start + 1,
    });

    start = end + 1;
    num++;
  }

  return lessons;
}

export function getNextSurah(completedSurahIds: number[]): number | null {
  const completed = new Set(completedSurahIds);
  return CURRICULUM_ORDER.find(id => !completed.has(id)) ?? null;
}

export function getSurahOrder(surahId: number): number {
  const idx = CURRICULUM_ORDER.indexOf(surahId as (typeof CURRICULUM_ORDER)[number]);
  return idx === -1 ? 999 : idx;
}

export function isMvpSurah(surahId: number): boolean {
  return surahId >= 1 && surahId <= 114;
}
