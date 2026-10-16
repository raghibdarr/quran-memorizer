import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { transliterateAyah, transliterateWord } from './transliterate';
import type { Surah } from '@/types/quran';

const words = (surah: number, ayah: number) => {
  const data = JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', `surah-${surah}.json`), 'utf8')) as Surah;
  return data.ayahs[ayah - 1].words.filter((w) => w.charType === 'word').map((w) => w.textUthmani);
};

describe('transliterateWord', () => {
  it.each([
    ['ٱللَّهُ', 'allaahu'],
    ['لِلَّهِ', 'lillaahi'],
    ['ٱلرَّحْمَـٰنِ', 'ar-rahmaani'],
    ['ٱلْكِتَـٰبُ', 'al-kitaabu'],
    ['ٱلَّذِينَ', 'al-ladheena'],
    ['لِلنَّاسِ', 'linnaasi'],
    ['كَفَرُوا۟', 'kafaroo'],
    ['أُو۟لَـٰٓئِكَ', "ulaa'ika"],
    ['ٱلصَّلَوٰةَ', 'as-salaata'],
    ['عَلَيْهِمْ', "'alayhim"],
    ['يسٓ', 'Yaa-Seen'],
  ])('%s → %s', (arabic, latin) => {
    expect(transliterateWord(arabic)).toBe(latin);
  });
});

describe('transliterateAyah', () => {
  it('joins the connecting alif and stops at the end (1:1)', () => {
    expect(transliterateAyah(words(1, 1))).toBe('Bismillaahir-rahmaanir-raheem');
  });
  it('merges a tanwīn or nūn into a doubled letter: idghām (2:5)', () => {
    expect(transliterateAyah(words(2, 5))).toContain('hudam mir rabbihim');
  });
  it('turns n to m before b: iqlāb (2:27 مِنۢ بَعْدِ)', () => {
    expect(transliterateAyah(words(2, 27))).toContain('mim ba');
  });
  it('shortens a long vowel before the connecting alif (2:255 فِى ٱلسَّمَـٰوَٰتِ)', () => {
    expect(transliterateAyah(words(2, 255))).toContain('fis-samaawaati');
  });
  it("drops the pronoun's lengthening when stopping (80:18)", () => {
    expect(transliterateAyah(words(80, 18))).toMatch(/khalaqah$/);
  });
  it('spells out the disjointed letters (2:1)', () => {
    expect(transliterateAyah(words(2, 1))).toBe('Alif-Laam-Meem');
  });
});
