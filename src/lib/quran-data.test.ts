import { describe, expect, it } from 'vitest';
import { getSurah, normalizeTajweedText } from './quran-data';

describe('tajweed text normalization', () => {
  it('maps U+0672 to the superscript alef the font can draw', () => {
    expect(normalizeTajweedText('صِّر<tajweed class=madda_normal>َٲ</tajweed>طَ')).toBe('صِّ<tajweed class=madda_normal>رَٰ</tajweed>طَ');
  });

  it('trims idghaam-without-ghunnah to the silent noon', () => {
    expect(normalizeTajweedText('م<tajweed class=idgham_wo_ghunnah>ِن ر</tajweed>َّبِّهِمْ')).toBe('م<tajweed class=idgham_wo_ghunnah>ِن</tajweed> رَّبِّهِمْ');
  });

  it('moves a madd on a bare vowel sign onto the letter carrying it', () => {
    expect(normalizeTajweedText('لْعَ<tajweed class=madda_normal>ـٰ</tajweed>لَم')).toBe('لْ<tajweed class=madda_normal>عَٰ</tajweed>لَم');
    // the letter already has its own colour: leave the sign plain, never colour the wrong letter
    expect(normalizeTajweedText('لَ<tajweed class=slnt>و</tajweed><tajweed class=madda_normal>ٰ</tajweed>ةَ')).toBe('لَ<tajweed class=slnt>و</tajweed>ٰةَ');
  });

  it('loaded surahs carry no U+0672 in tajweed text (Al-Fatihah 1:6)', async () => {
    const surah = await getSurah(1);
    const tajweed = surah.ayahs.map((a) => a.textUthmaniTajweed ?? '').join('');
    expect(tajweed).not.toMatch(/ٲ/);
    expect(surah.ayahs[5].textUthmaniTajweed).toContain('ٰ');
  });
});
