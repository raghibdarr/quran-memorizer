import type { LessonDef } from '@/types/quran';
import ayahWeightsJson from '@/data/ayah-weights.json';

// Per-ayah real-word counts (regenerate with scripts/generate-ayah-weights.mjs).
// Lessons pack to a WORD budget, not a flat ayah count — five heavyweight Baqarah
// ayahs are not the same day's work as five Juz-30 ayahs, and a giant ayah like
// 2:282 (128 words) becomes its own lesson.
const AYAH_WEIGHTS: Record<string, number[]> = ayahWeightsJson;

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

const TARGET_WORDS_PER_LESSON = 45; // soft budget: one lesson's memorization load
const MAX_AYAHS_PER_LESSON = 5;     // cap so many tiny ayahs still form small lessons
const MIN_LESSON_AYAHS = 3;         // orphan tails smaller than this may merge...
const LIGHT_ORPHAN_WORDS = 20;      // ...but only when they're this light
const SINGLE_LESSON_MAX_AYAHS = 8;  // a short segment stays one lesson...
const SINGLE_LESSON_MAX_WORDS = 60; // ...if it's also light enough overall

function ayahWords(surahId: number, ayahNumber: number): number {
  // Fallback ~average-short-ayah weight keeps packing sane if a surah is missing
  return AYAH_WEIGHTS[String(surahId)]?.[ayahNumber - 1] ?? 8;
}

function rangeWords(surahId: number, start: number, end: number): number {
  let total = 0;
  for (let a = start; a <= end; a++) total += ayahWords(surahId, a);
  return total;
}

/** Generate lessons for a single contiguous segment of ayahs, packed to a word budget */
function generateSegmentLessons(
  surahId: number,
  segStart: number,
  segEnd: number,
  juzNumber: number,
  startLessonNum: number,
): LessonDef[] {
  const segCount = segEnd - segStart + 1;

  // Short AND light segments = single lesson (e.g. Al-Fatihah, the short surahs)
  if (segCount <= SINGLE_LESSON_MAX_AYAHS && rangeWords(surahId, segStart, segEnd) <= SINGLE_LESSON_MAX_WORDS) {
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
    // Greedy-fill: take ayahs while under both the ayah cap and the word budget.
    // A single over-budget ayah (e.g. 2:282, 128 words) becomes its own lesson.
    let end = start;
    let words = ayahWords(surahId, start);
    while (
      end < segEnd &&
      end - start + 1 < MAX_AYAHS_PER_LESSON &&
      words + ayahWords(surahId, end + 1) <= TARGET_WORDS_PER_LESSON
    ) {
      end++;
      words += ayahWords(surahId, end);
    }

    // Merge a light orphan tail instead of leaving a stub lesson; a heavy tail
    // (long ayahs) stays its own small-but-real lesson.
    const remaining = segEnd - end;
    if (remaining > 0 && remaining < MIN_LESSON_AYAHS && rangeWords(surahId, end + 1, segEnd) <= LIGHT_ORPHAN_WORDS) {
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
