import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { SurahMeta } from '@/types/quran';
import { fuzzySurahScore } from './fuzzy';

const surahs = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'data', 'surahs-index.json'), 'utf8')
) as SurahMeta[];

function topResult(query: string): number | null {
  let best: { id: number; score: number } | null = null;
  for (const s of surahs) {
    const score = fuzzySurahScore(query, {
      id: s.id,
      name: s.nameSimple,
      translation: s.nameTranslation,
      arabic: s.nameArabic,
    });
    if (score > 0 && (!best || score > best.score)) best = { id: s.id, score };
  }
  return best?.id ?? null;
}

describe('fuzzySurahScore', () => {
  it.each([
    ['fatiha', 1],
    ['al-fatihah', 1],
    ['al fatiha', 1],
    ['baqara', 2],
    ['yaseen', 36],
    ['ya-sin', 36],
    ['ikhlas', 112],
    ['annas', 114],
    ['rahman', 55],
    ['kahf', 18],
    ['mulk', 67],
    ['waqia', 56],
    ['zariyat', 51],
    ['dhariyat', 51],
    ['jumuah', 62],
  ])('finds "%s" -> surah %i', (query, expected) => {
    expect(topResult(query)).toBe(expected);
  });

  it('tolerates small typos', () => {
    expect(topResult('fathia')).toBe(1);
    expect(topResult('iklas')).toBe(112);
  });

  it('matches by translation', () => {
    expect(topResult('the opener')).toBe(1);
    expect(topResult('cow')).toBe(2);
  });

  it('numeric queries match the surah number exactly', () => {
    expect(topResult('36')).toBe(36);
    expect(topResult('114')).toBe(114);
  });

  it('nonsense finds nothing', () => {
    expect(topResult('xyzqqq')).toBeNull();
    expect(topResult('')).toBeNull();
  });

  it('exact names outrank fuzzy competitors', () => {
    // "nas" should hit An-Nas (core exact), not a substring elsewhere
    expect(topResult('nas')).toBe(114);
  });
});

describe('search honorifics', () => {
  it('"Yasin sharif" still finds Ya-Sin', () => {
    const target = { id: 36, name: 'Ya-Sin', translation: 'Ya Sin' };
    expect(fuzzySurahScore('Yasin sharif', target)).toBeGreaterThan(0);
    expect(fuzzySurahScore('yaseen shareef', target)).toBeGreaterThan(0);
  });
});
