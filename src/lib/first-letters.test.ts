import { describe, expect, it } from 'vitest';
import { firstLetters } from './first-letters';

describe('first-letter cues', () => {
  it('shows the opening letter and its marks, joined onward', () => {
    expect(firstLetters('قُلْ')).toBe('قُـ');
    expect(firstLetters('هُوَ')).toBe('هُـ');
  });

  it('does not join after a letter that never joins', () => {
    expect(firstLetters('رَبِّ')).toBe('رَ');
    expect(firstLetters('دِينِ')).toBe('دِ');
  });

  it('shows the article through the next letter', () => {
    expect(firstLetters('ٱلْحَمْدُ')).toBe('ٱلْحَـ');
    expect(firstLetters('ٱلرَّحْمَٰنِ')).toBe('ٱلرَّ');
    expect(firstLetters('وَٱلَّذِينَ')).toBe('وَٱلَّذِ');
  });

  it('leaves a one-letter word whole', () => {
    expect(firstLetters('ق')).toBe('ق');
  });
});
