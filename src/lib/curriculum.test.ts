import { describe, expect, it } from 'vitest';
import {
  CURRICULUM_ORDER,
  generateLessons,
  generateLessonsWithJuzBoundaries,
  getNextSurah,
  getSurahOrder,
  isMvpSurah,
} from './curriculum';

describe('generateLessons (no juz info)', () => {
  it('short surah (<= 8 ayahs) yields a single lesson covering all ayahs', () => {
    const lessons = generateLessons(112, 4); // Al-Ikhlas, 4 ayahs
    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({
      lessonId: '112-1',
      surahId: 112,
      lessonNumber: 1,
      ayahStart: 1,
      ayahEnd: 4,
      ayahCount: 4,
      juzNumber: 0, // no juz info provided
    });
  });

  it('boundary at 8 ayahs stays a single lesson', () => {
    const lessons = generateLessons(99, 8);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].ayahCount).toBe(8);
  });

  it('9 ayahs splits into multiple 5-ayah lessons', () => {
    const lessons = generateLessons(95, 9);
    expect(lessons.length).toBeGreaterThan(1);
    expect(lessons.reduce((sum, l) => sum + l.ayahCount, 0)).toBe(9);
    // Lessons should cover all ayahs contiguously
    expect(lessons[0].ayahStart).toBe(1);
    expect(lessons[lessons.length - 1].ayahEnd).toBe(9);
  });

  it('avoids orphan groups smaller than 3 ayahs at the end', () => {
    // 11 ayahs at 5-per-lesson would naively be 5+5+1; should merge to 5+6
    const lessons = generateLessons(89, 11);
    expect(lessons).toHaveLength(2);
    expect(lessons[0].ayahCount).toBe(5);
    expect(lessons[1].ayahCount).toBe(6);
  });

  it('generates contiguous, non-overlapping lessons', () => {
    const lessons = generateLessons(2, 50);
    for (let i = 1; i < lessons.length; i++) {
      expect(lessons[i].ayahStart).toBe(lessons[i - 1].ayahEnd + 1);
    }
  });

  it('lesson IDs follow surahId-lessonNumber format', () => {
    const lessons = generateLessons(78, 40);
    lessons.forEach((l, i) => {
      expect(l.lessonId).toBe(`78-${i + 1}`);
      expect(l.lessonNumber).toBe(i + 1);
    });
  });
});

describe('generateLessonsWithJuzBoundaries', () => {
  it('falls back to generateLessons when juz segments are empty', () => {
    const lessons = generateLessonsWithJuzBoundaries(112, 4, []);
    expect(lessons).toHaveLength(1);
    expect(lessons[0].juzNumber).toBe(0);
  });

  it('single-juz surah tags every lesson with that juz', () => {
    const lessons = generateLessonsWithJuzBoundaries(78, 40, [
      { juzNumber: 30, ayahStart: 1, ayahEnd: 40 },
    ]);
    expect(lessons.length).toBeGreaterThan(1);
    expect(lessons.every((l) => l.juzNumber === 30)).toBe(true);
  });

  it('multi-juz surah splits lessons at juz boundaries', () => {
    // Synthetic surah: 30 ayahs split across juz 1 (ayahs 1-15) and juz 2 (16-30)
    const lessons = generateLessonsWithJuzBoundaries(2, 30, [
      { juzNumber: 1, ayahStart: 1, ayahEnd: 15 },
      { juzNumber: 2, ayahStart: 16, ayahEnd: 30 },
    ]);
    const juz1Lessons = lessons.filter((l) => l.juzNumber === 1);
    const juz2Lessons = lessons.filter((l) => l.juzNumber === 2);
    expect(juz1Lessons.length).toBeGreaterThan(0);
    expect(juz2Lessons.length).toBeGreaterThan(0);
    // No lesson crosses the boundary
    expect(juz1Lessons.every((l) => l.ayahEnd <= 15)).toBe(true);
    expect(juz2Lessons.every((l) => l.ayahStart >= 16)).toBe(true);
  });

  it('numbers lessons sequentially across juz segments', () => {
    const lessons = generateLessonsWithJuzBoundaries(2, 30, [
      { juzNumber: 1, ayahStart: 1, ayahEnd: 15 },
      { juzNumber: 2, ayahStart: 16, ayahEnd: 30 },
    ]);
    lessons.forEach((l, i) => {
      expect(l.lessonNumber).toBe(i + 1);
      expect(l.lessonId).toBe(`2-${i + 1}`);
    });
  });

  it('covers every ayah exactly once across multi-juz split', () => {
    const lessons = generateLessonsWithJuzBoundaries(2, 30, [
      { juzNumber: 1, ayahStart: 1, ayahEnd: 15 },
      { juzNumber: 2, ayahStart: 16, ayahEnd: 30 },
    ]);
    const total = lessons.reduce((sum, l) => sum + l.ayahCount, 0);
    expect(total).toBe(30);
  });
});

describe('curriculum ordering', () => {
  it('CURRICULUM_ORDER contains all 114 surahs exactly once', () => {
    expect(CURRICULUM_ORDER).toHaveLength(114);
    const set = new Set<number>(CURRICULUM_ORDER);
    expect(set.size).toBe(114);
    for (let i = 1; i <= 114; i++) expect(set.has(i)).toBe(true);
  });

  it('Al-Fatiha (1) appears first in the curriculum', () => {
    expect(CURRICULUM_ORDER[0]).toBe(1);
  });

  it('getSurahOrder returns position for known surahs', () => {
    expect(getSurahOrder(1)).toBe(0);
    expect(getSurahOrder(114)).toBeGreaterThanOrEqual(0);
  });

  it('getNextSurah returns first uncompleted surah in curriculum order', () => {
    expect(getNextSurah([])).toBe(1); // nothing done -> first
    expect(getNextSurah([1])).toBe(112); // second in curriculum order
  });

  it('getNextSurah returns null when all surahs are completed', () => {
    const all: number[] = Array.from(CURRICULUM_ORDER);
    expect(getNextSurah(all)).toBeNull();
  });
});

describe('isMvpSurah', () => {
  it('accepts surahs 1-114', () => {
    expect(isMvpSurah(1)).toBe(true);
    expect(isMvpSurah(57)).toBe(true);
    expect(isMvpSurah(114)).toBe(true);
  });

  it('rejects out-of-range numbers', () => {
    expect(isMvpSurah(0)).toBe(false);
    expect(isMvpSurah(115)).toBe(false);
    expect(isMvpSurah(-1)).toBe(false);
  });
});
