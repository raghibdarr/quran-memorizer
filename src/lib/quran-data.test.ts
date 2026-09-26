import { describe, expect, it } from 'vitest';
import { getSurah, normalizeTajweedText } from './quran-data';

describe('tajweed text normalization', () => {
  it('maps U+0672 to the superscript alef the font can draw', () => {
    expect(normalizeTajweedText('صِّر<tajweed class=madda_normal>َٲ</tajweed>طَ')).toBe('صِّر<tajweed class=madda_normal>َٰ</tajweed>طَ');
  });

  it('loaded surahs carry no U+0672 in tajweed text (Al-Fatihah 1:6)', async () => {
    const surah = await getSurah(1);
    const tajweed = surah.ayahs.map((a) => a.textUthmaniTajweed ?? '').join('');
    expect(tajweed).not.toMatch(/ٲ/);
    expect(surah.ayahs[5].textUthmaniTajweed).toContain('ٰ');
  });
});
