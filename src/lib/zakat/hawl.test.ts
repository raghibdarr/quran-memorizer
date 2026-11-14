import { afterEach, describe, expect, it } from 'vitest';
import { forceTabularForTests, hijriEngine, tabularFromHijri, toHijri } from '@/lib/hijri/convert';
import { inRange, NOTIFY_RANGES } from '@/lib/notify/registry';
import { HAWL_REMINDER_ID, hijriLabel, nextHawlDate, planHawlReminder } from './hawl';

afterEach(() => forceTabularForTests(false));

describe('nextHawlDate', () => {
  it('is the same Hijri day one lunar year on (Umm al-Qura)', () => {
    if (hijriEngine() !== 'umalqura') return; // platform without the calendar: covered by the tabular tests
    // 1 Ramadan 1444 = 23 March 2023; 1 Ramadan 1445 = 11 March 2024
    expect(nextHawlDate('2023-03-23', '2023-06-01')).toMatchObject({ iso: '2024-03-11', hijri: { year: 1445, month: 9, day: 1 }, years: 1 });
    // 1 Muharram 1446 = 7 July 2024; 1 Muharram 1447 = 26 June 2025
    expect(nextHawlDate('2024-07-07', '2024-07-08')?.iso).toBe('2025-06-26');
  });

  it('a lunar year is 354 or 355 days, about 11 days shorter than a solar year', () => {
    for (const engine of [false, true]) {
      forceTabularForTests(engine);
      const n = nextHawlDate('2026-01-10', '2026-01-11')!;
      const days = (Date.parse(n.iso) - Date.parse('2026-01-10')) / 86_400_000;
      expect([354, 355]).toContain(days);
      expect(toHijri(n.iso)).toEqual(n.hijri);
      const start = toHijri('2026-01-10');
      expect(n.hijri).toEqual({ ...start, year: start.year + 1 });
    }
  });

  it('skips anniversaries already past, and counts the years', () => {
    forceTabularForTests(true);
    const n = nextHawlDate('2020-05-01', '2026-11-13')!;
    expect(n.iso >= '2026-11-13').toBe(true);
    expect(n.years).toBe(n.hijri.year - toHijri('2020-05-01').year);
    // The day itself counts as "on or after"
    expect(nextHawlDate('2020-05-01', n.iso)?.iso).toBe(n.iso);
  });

  it('a 30th in a month that has 29 days next year moves to the 29th', () => {
    forceTabularForTests(true);
    // Tabular: 1445 is a leap year (Dhu al-Hijjah has 30 days), 1446 is not
    const start = tabularFromHijri(1445, 12, 30);
    const n = nextHawlDate(start, start)!;
    expect(n.hijri).toEqual({ year: 1446, month: 12, day: 29 });
    expect(n.iso).toBe(tabularFromHijri(1446, 12, 29));
  });

  it('follows the user\'s Hijri day offset', () => {
    for (const offset of [-1, 1, 2]) {
      const n = nextHawlDate('2026-01-10', '2026-01-11', offset)!;
      expect(toHijri(n.iso, offset)).toEqual(n.hijri);
      expect(n.hijri).toEqual({ ...toHijri('2026-01-10', offset), year: toHijri('2026-01-10', offset).year + 1 });
    }
  });

  it('an old start date gives the anniversary for this year, the same as walking year by year', () => {
    for (const engine of [false, true]) {
      forceTabularForTests(engine);
      for (const [start, today] of [
        ['1990-03-15', '2026-11-13'],
        ['1600-01-01', '2026-11-13'], // more than 400 lunar years back
        ['2026-11-13', '2026-11-13'], // started today: the first anniversary
        ['2027-06-01', '2026-11-13'], // a start in the future still gives its first anniversary
      ] as const) {
        const n = nextHawlDate(start, today)!;
        expect(n, start).not.toBeNull();
        expect(n.iso >= today).toBe(true);
        expect(n.years).toBeGreaterThanOrEqual(1);
        const s = toHijri(start);
        expect(n.hijri.year).toBe(s.year + n.years);
        expect(n.hijri.month).toBe(s.month);
        // The anniversary before it has passed (or it is the first)
        if (n.years > 1) {
          const days = (Date.parse(n.iso) - Date.parse(today)) / 86_400_000;
          expect(days).toBeLessThan(356);
        }
      }
    }
  });

  it('is the day itself on an anniversary, and the next one the day after', () => {
    forceTabularForTests(true);
    const first = nextHawlDate('2024-02-01', '2024-02-02')!;
    expect(nextHawlDate('2024-02-01', first.iso)).toMatchObject({ iso: first.iso, years: 1 });
    const second = nextHawlDate('2024-02-01', new Date(Date.parse(first.iso) + 86_400_000).toISOString().slice(0, 10))!;
    expect(second.years).toBe(2);
    expect(second.iso > first.iso).toBe(true);
  });

  it('never throws on dates the calendar cannot place', () => {
    for (const start of ['0001-01-01', '0300-05-05', '9999-12-31']) {
      expect(() => nextHawlDate(start, '2026-11-13')).not.toThrow();
      expect(() => hijriLabel(start)).not.toThrow();
    }
    // Before the Hijri calendar begins: no anniversary, no label
    expect(nextHawlDate('0300-05-05', '2026-11-13')).toBeNull();
    expect(hijriLabel('0300-05-05')).toBe('');
  });

  it('rejects malformed dates', () => {
    expect(nextHawlDate('10/01/2026', '2026-01-01')).toBeNull();
    expect(hijriLabel('nope')).toBe('');
  });
});

describe('planHawlReminder', () => {
  const start = '2026-01-10';
  const next = () => nextHawlDate(start, '2026-01-11')!;

  it('nothing when off or without a start date', () => {
    expect(planHawlReminder({ enabled: false, hawlStartIso: start, now: new Date(2026, 5, 1) })).toEqual([]);
    expect(planHawlReminder({ enabled: true, hawlStartIso: null, now: new Date(2026, 5, 1) })).toEqual([]);
  });

  it('one reminder, in the reminders range, at 9:00 local on the expected day', () => {
    const [n, ...rest] = planHawlReminder({ enabled: true, hawlStartIso: start, now: new Date(2026, 5, 1, 12) });
    expect(rest).toEqual([]);
    expect(n.id).toBe(HAWL_REMINDER_ID);
    expect(HAWL_REMINDER_ID).toBe(22100);
    expect(inRange(n.id, NOTIFY_RANGES.reminders)).toBe(true);
    const at = n.schedule!.at!;
    const [y, m, d] = next().iso.split('-').map(Number);
    expect([at.getFullYear(), at.getMonth() + 1, at.getDate(), at.getHours(), at.getMinutes()]).toEqual([y, m, d, 9, 0]);
    expect(n.body).toMatch(/expected/);
    expect(n.body).not.toMatch(/must/i);
    expect(n.extra).toEqual({ url: '/zakat' });
  });

  it('on the day after 9:00, the reminder moves to the following year', () => {
    const [y, m, d] = next().iso.split('-').map(Number);
    const [n] = planHawlReminder({ enabled: true, hawlStartIso: start, now: new Date(y, m - 1, d, 10) });
    expect(n.schedule!.at!.getHours()).toBe(9);
    expect(n.schedule!.at!.getTime()).toBeGreaterThan(new Date(y, m - 1, d, 10).getTime() + 300 * 86_400_000);
    // Before 9:00 that same day it is still today
    const [early] = planHawlReminder({ enabled: true, hawlStartIso: start, now: new Date(y, m - 1, d, 8) });
    expect(early.schedule!.at!.getDate()).toBe(d);
  });
});
