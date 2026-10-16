import { describe, expect, it } from 'vitest';
import index from '@/data/search-index.json';
import meta from '@/data/quran-meta.json';
import { ayahIndex, matchRanges, normalizeArabic, pageOf, parseJump, searchAyahs, type QuranMeta, type SearchIndex } from './search';

const idx = index as unknown as SearchIndex;
const m = meta as unknown as QuranMeta;

describe('normalizeArabic', () => {
  it('drops harakat and folds letter variants, mapping back to the source', () => {
    const { norm, map } = normalizeArabic('ٱلصَّلَوٰةَ');
    expect(norm).toBe('الصلوه');
    expect(map[0]).toBe(0);
  });
});

describe('parseJump', () => {
  it('reads surah:ayah in several spellings', () => {
    expect(parseJump('2:255', idx.counts, m)).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
    expect(parseJump('2 255', idx.counts, m)).toEqual({ kind: 'ayah', surah: 2, ayah: 255 });
    expect(parseJump('112.4', idx.counts, m)).toEqual({ kind: 'ayah', surah: 112, ayah: 4 });
    expect(parseJump('112:5', idx.counts, m)).toBeNull();
  });
  it('jumps to Madani pages and juz', () => {
    expect(parseJump('page 1', idx.counts, m)).toMatchObject({ surah: 1, ayah: 1 });
    expect(parseJump('p604', idx.counts, m)).toMatchObject({ surah: 112, ayah: 1 });
    expect(parseJump('juz 30', idx.counts, m)).toMatchObject({ surah: 78, ayah: 1 });
    expect(parseJump('para 2', idx.counts, m)).toMatchObject({ surah: 2, ayah: 142 });
    expect(parseJump('page 605', idx.counts, m)).toBeNull();
  });
});

describe('pageOf', () => {
  it('finds the page an ayah is on', () => {
    expect(pageOf(m, 1, 7)).toBe(1);
    expect(pageOf(m, 2, 255)).toBe(42);
    expect(pageOf(m, 114, 6)).toBe(604);
  });
});

describe('searchAyahs', () => {
  it('has every ayah in order', () => {
    expect(idx.arabic).toHaveLength(6236);
    expect(ayahIndex(idx.counts, 114, 6)).toBe(6235);
  });

  it('finds Arabic regardless of harakat and alef/ta marbuta spelling', () => {
    const { hits } = searchAyahs(idx, 'الله لا إله إلا هو الحي القيوم');
    expect(hits.map((h) => `${h.surah}:${h.ayah}`)).toEqual(expect.arrayContaining(['2:255', '3:2']));
    const salah = searchAyahs(idx, 'الصلاه');
    expect(salah.total).toBeGreaterThan(50);
  });

  it("doesn't match the basmala Tanzil prefixes to first ayahs", () => {
    const { hits } = searchAyahs(idx, 'بسم الله الرحمن الرحيم', 200);
    expect(hits.map((h) => `${h.surah}:${h.ayah}`).sort()).toEqual(['1:1', '27:30']);
  });

  it('finds translation text with every word required, phrase hits first', () => {
    const { hits } = searchAyahs(idx, 'kursi extends over the heavens');
    expect(hits[0]).toMatchObject({ surah: 2, ayah: 255, field: 'translation' });
    expect(searchAyahs(idx, 'zz').total).toBe(0);
    expect(searchAyahs(idx, 'allah').total).toBeGreaterThan(1000);
  });

  it('highlights the matched span in the original text', () => {
    const text = 'إياك نعبد وإياك نستعين';
    expect(matchRanges(text, ['نعبد'], true)).toEqual([[5, 9]]);
  });
});
