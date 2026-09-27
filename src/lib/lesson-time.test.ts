import { describe, expect, it } from 'vitest';
import { estimateLessonSeconds, formatLessonTime } from './lesson-time';
import { lessonWordCounts } from './curriculum';

describe('lesson time estimates', () => {
  it('Al-Fatihah lands near the timed walkthrough (~35 min)', () => {
    const words = lessonWordCounts({ surahId: 1, ayahStart: 1, ayahEnd: 7 });
    expect(words).toEqual([4, 4, 2, 3, 4, 3, 9]);
    const min = estimateLessonSeconds(words) / 60;
    expect(min).toBeGreaterThan(28);
    expect(min).toBeLessThan(42);
    expect(formatLessonTime(words)).toMatch(/^~\d+–\d+ min$/);
  });

  it('a short lesson reads short, and longer lessons read longer', () => {
    const ikhlas = lessonWordCounts({ surahId: 112, ayahStart: 1, ayahEnd: 4 });
    const fatihah = lessonWordCounts({ surahId: 1, ayahStart: 1, ayahEnd: 7 });
    expect(estimateLessonSeconds(ikhlas)).toBeLessThan(estimateLessonSeconds(fatihah));
    expect(estimateLessonSeconds(ikhlas) / 60).toBeLessThan(25);
  });
});
