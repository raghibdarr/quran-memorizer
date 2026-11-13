import { describe, expect, it } from 'vitest';
import { backLabelFor } from './back-label';

const names: Record<number, string> = { 67: 'Al-Mulk' };
const lookup = async (id: number) => names[id];

describe('backLabelFor', () => {
  it.each([
    ['/', 'Home'],
    ['/?tab=juz', 'Home'],
    ['/review', 'Review'],
    ['/review/', 'Review'],
    ['/review/session?stream=sabqi', 'Review'],
    ['/essentials', 'Learn'],
    ['/progress', 'Progress'],
    ['/prayer', 'Prayer'],
    ['/prayer/', 'Prayer'],
    ['/prayer/settings', 'Prayer settings'],
    ['/prayer/tracker?month=2026-11', 'Prayer log'],
    ['/qibla', 'Qibla'],
    ['/hadith', 'Hadith'],
    ['/plan/edit', 'Plan'],
    ['/juz/30', 'Juz 30'],
    ['/lesson/67', 'Al-Mulk'],
    ['/lesson/67/', 'Al-Mulk'],
  ])('%s → %s', async (url, label) => {
    expect(await backLabelFor(url, lookup)).toBe(label);
  });

  it('falls back to "Back" when the destination has no certain short name', async () => {
    expect(await backLabelFor('/lesson/999', lookup)).toBe('Back');
    expect(await backLabelFor('/essentials/duas', lookup)).toBe('Back');
    expect(await backLabelFor('/hadith/view?id=01', lookup)).toBe('Back');
    // Only the hub is "Prayer"; its other screens aren't named for the hub
    expect(await backLabelFor('/prayer/setup', lookup)).toBe('Back');
    expect(await backLabelFor('/prayer/why', lookup)).toBe('Back');
    expect(await backLabelFor('/learn?surah=1&lesson=1', lookup)).toBe('Back');
  });
});
