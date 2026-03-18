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
const MIN_LESSON_AYAHS = 3;

/** Generate lessons for a single contiguous segment of ayahs */
function generateSegmentLessons(
  surahId: number,
  segStart: number,
  segEnd: number,
  juzNumber: number,
  startLessonNum: number,
): LessonDef[] {
  const segCount = segEnd - segStart + 1;

  // Short segments = single lesson
  if (segCount <= 8) {
    return [{
      lessonId: `${surahId}-${startLessonNum}`,
      surahId,
      lessonNumber: startLessonNum,
      ayahStart: segStart,
      ayahEnd: segEnd,
      ayahCount: segCount,
      juzNumber,
    }];
  }

  const lessons: LessonDef[] = [];
  let start = segStart;
  let num = startLessonNum;

  while (start <= segEnd) {
    let end = Math.min(start + AYAHS_PER_LESSON - 1, segEnd);

    // Avoid orphan groups of fewer than MIN_LESSON_AYAHS at the end
    const remaining = segEnd - end;
    if (remaining > 0 && remaining < MIN_LESSON_AYAHS) {
      end = segEnd;
    }

    lessons.push({
      lessonId: `${surahId}-${num}`,
      surahId,
      lessonNumber: num,
      ayahStart: start,
      ayahEnd: end,
      ayahCount: end - start + 1,
      juzNumber,
    });

    start = end + 1;
    num++;
  }

  return lessons;
}

/** Generate lesson definitions for a surah (no juz awareness — fallback) */
export function generateLessons(surahId: number, versesCount: number): LessonDef[] {
  return generateSegmentLessons(surahId, 1, versesCount, 0, 1);
}

/** Generate lesson definitions respecting juz boundaries */
export function generateLessonsWithJuzBoundaries(
  surahId: number,
  versesCount: number,
  juzSegments: Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }>,
): LessonDef[] {
  // No juz info — fall back to simple generation
  if (!juzSegments.length) {
    return generateLessons(surahId, versesCount);
  }

  // Single juz segment — same as before but with juzNumber
  if (juzSegments.length === 1) {
    return generateSegmentLessons(surahId, 1, versesCount, juzSegments[0].juzNumber, 1);
  }

  // Multi-juz surah — generate lessons per segment, number sequentially
  const allLessons: LessonDef[] = [];
  let lessonNum = 1;

  for (const seg of juzSegments) {
    const segLessons = generateSegmentLessons(surahId, seg.ayahStart, seg.ayahEnd, seg.juzNumber, lessonNum);
    allLessons.push(...segLessons);
    lessonNum += segLessons.length;
  }

  return allLessons;
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
