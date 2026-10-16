import { describe, expect, it } from 'vitest';
import { khatmStatus, portion, KHATM_PAGES } from './khatm';
import type { Khatm } from '@/stores/reader-store';

const DAY = 86_400_000;
const start = new Date(2026, 9, 1, 9, 0).getTime();
const k = (pages: number[], days = 30): Khatm => ({ id: 'x', startedAt: start, days, pagesRead: Object.fromEntries(pages.map((p) => [String(p), start])) });
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('khatm', () => {
  it('splits 604 pages evenly over the days, covering every page once', () => {
    const seen: number[] = [];
    for (let d = 0; d < 30; d++) { const [a, b] = portion(d, 30); seen.push(...range(a, b)); }
    expect(seen).toEqual(range(1, KHATM_PAGES));
    expect(portion(0, 30)).toEqual([1, 20]);
    expect(portion(29, 30)).toEqual([584, 604]);
  });

  it("knows today's pages and how far behind you are", () => {
    const s = khatmStatus(k(range(1, 20)), start + 2 * DAY);
    expect(s).toMatchObject({ dayNo: 3, today: [41, 60], read: 20, due: 60, behind: 40, todayLeft: 20, nextPage: 21, finished: false });
  });

  it('is on track when the reading is ahead, and finished at 604', () => {
    expect(khatmStatus(k(range(1, 30)), start).behind).toBe(0);
    const done = khatmStatus(k(range(1, 604)), start + 10 * DAY);
    expect(done).toMatchObject({ finished: true, nextPage: null, behind: 0 });
    expect(khatmStatus(k([], 7), start + 9 * DAY)).toMatchObject({ overdue: true, due: 604 });
  });
});
