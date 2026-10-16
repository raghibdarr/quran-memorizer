import { describe, expect, it } from 'vitest';
import { daysAway, dueToday, localDate, localHour, reminderText, wantsDigest } from './notify-summary';

// 2026-10-16 18:30 UTC = 19:30 in London (BST), 03:30 next day in Tokyo
const NOW = Date.UTC(2026, 9, 16, 18, 30);

describe('server-side reminder summary', () => {
  it('reads local hour and date in the user’s zone', () => {
    expect(localHour('Europe/London', NOW)).toBe(19);
    expect(localDate('Asia/Tokyo', NOW)).toBe('2026-10-17');
    expect(localHour('Not/AZone', NOW)).toBe(18); // unknown zone falls back to UTC
  });

  it('counts reviews due by the end of local today', () => {
    const endLondon = Date.UTC(2026, 9, 16, 23, 0); // 00:00 BST
    const due = dueToday({ lessonCards: [{ nextReview: endLondon - 1 }, { nextReview: endLondon + 60e3 }], cards: [{ nextReview: 0 }] }, 'Europe/London', NOW);
    expect(due).toEqual({ lessons: 1, ayahs: 1 });
    expect(dueToday(null, 'UTC', NOW)).toEqual({ lessons: 0, ayahs: 0 });
  });

  it('words the reminder, lessons first', () => {
    expect(reminderText({ lessons: 2, ayahs: 9 }).body).toMatch(/^2 lessons to review today/);
    expect(reminderText({ lessons: 0, ayahs: 1 }).body).toMatch(/^1 ayah to review today/);
  });

  it('sends the digest only after a week away with reviews due, weekly at most', () => {
    expect(daysAway('2026-10-08', 'Europe/London', NOW)).toBe(8);
    const due = { lessons: 1, ayahs: 0 };
    expect(wantsDigest({ daysAway: 8, due, lastDigestAt: null, now: NOW })).toBe(true);
    expect(wantsDigest({ daysAway: 3, due, lastDigestAt: null, now: NOW })).toBe(false);
    expect(wantsDigest({ daysAway: 9, due: { lessons: 0, ayahs: 0 }, lastDigestAt: null, now: NOW })).toBe(false);
    expect(wantsDigest({ daysAway: 9, due, lastDigestAt: NOW - 2 * 864e5, now: NOW })).toBe(false);
  });
});
