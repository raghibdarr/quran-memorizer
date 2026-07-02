import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { Ayah, Surah } from '@/types/quran';
import { segmentAyah, realWords, buildAyahWordData, SEGMENT_THRESHOLD } from './segments';

const DATA_DIR = join(process.cwd(), 'src', 'data');

function loadAllSurahs(): Surah[] {
  return readdirSync(DATA_DIR)
    .filter((f) => /^surah-\d+\.json$/.test(f))
    .map((f) => JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')) as Surah);
}

function getAyah(surahId: number, ayahNumber: number): Ayah {
  const surah = JSON.parse(
    readFileSync(join(DATA_DIR, `surah-${surahId}.json`), 'utf8')
  ) as Surah;
  const ayah = surah.ayahs.find((a) => a.number === ayahNumber);
  if (!ayah) throw new Error(`missing ${surahId}:${ayahNumber}`);
  return ayah;
}

const FORBIDDEN = 'ۙ';
const SAKTA = 'ۜ';

describe('segmentAyah invariants (all 114 surahs)', () => {
  const surahs = loadAllSurahs();

  it('loads the full mushaf', () => {
    expect(surahs.length).toBe(114);
    expect(surahs.reduce((n, s) => n + s.ayahs.length, 0)).toBe(6236);
  });

  it('segments partition the words exactly, in order, with consistent metadata', () => {
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        const words = realWords(ayah);
        const segs = segmentAyah(ayah);
        expect(segs.length).toBeGreaterThan(0);
        expect(segs[0].wordStart).toBe(0);
        expect(segs[segs.length - 1].wordEnd).toBe(words.length - 1);
        expect(segs[segs.length - 1].endMark).toBeNull();
        for (let i = 0; i < segs.length; i++) {
          const seg = segs[i];
          expect(seg.index).toBe(i);
          expect(seg.count).toBe(segs.length);
          expect(seg.wordEnd).toBeGreaterThanOrEqual(seg.wordStart); // never empty
          if (i > 0) expect(seg.wordStart).toBe(segs[i - 1].wordEnd + 1); // contiguous
        }
      }
    }
  });

  it('short ayahs stay whole; only >threshold ayahs ever segment', () => {
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        const words = realWords(ayah);
        const segs = segmentAyah(ayah);
        if (words.length <= SEGMENT_THRESHOLD) expect(segs.length).toBe(1);
      }
    }
  });

  it('never places a boundary on a forbidden (la) or sakta mark', () => {
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        const words = realWords(ayah);
        const segs = segmentAyah(ayah);
        for (const seg of segs.slice(0, -1)) {
          const boundaryWord = words[seg.wordEnd].textUthmani;
          expect(boundaryWord.includes(FORBIDDEN)).toBe(false);
          expect(seg.endMark).not.toBe(FORBIDDEN);
          expect(seg.endMark).not.toBe(SAKTA);
          expect(seg.endMark).not.toBeNull(); // every internal boundary sits on a real mark
        }
      }
    }
  });

  it("mu'anaqah pairs yield at most one boundary (never both)", () => {
    // Force segmentation with threshold 0 so short mu'anaqah ayahs (e.g. 2:2) exercise the rule.
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        const words = realWords(ayah);
        const muanaqahWords = words.filter((w) => w.textUthmani.includes('ۛ')).length;
        if (muanaqahWords < 2) continue;
        const segs = segmentAyah(ayah, 0);
        const muanaqahBoundaries = segs.filter((s) => s.endMark === 'ۛ').length;
        expect(muanaqahBoundaries).toBeLessThanOrEqual(muanaqahWords / 2);
      }
    }
  });

  it('2:2 (la rayba fihi) splits at the first mu\'anaqah only', () => {
    const segs = segmentAyah(getAyah(2, 2), 0);
    const marks = segs.map((s) => s.endMark);
    expect(marks.filter((m) => m === 'ۛ').length).toBe(1);
  });

  // === Mutation guards: pin real splitting behavior so a broken engine can't pass ===

  it('2:282 (the longest ayah) actually splits at its primary marks', () => {
    const segs = segmentAyah(getAyah(2, 282));
    expect(segs.length).toBe(14);
    for (const seg of segs) expect(seg.wordEnd - seg.wordStart + 1).toBeLessThanOrEqual(SEGMENT_THRESHOLD);
    for (const seg of segs.slice(0, -1)) expect(['ۚ', 'ۗ', 'ۘ', 'ۛ', 'ۖ']).toContain(seg.endMark);
  });

  it('2:255 (Ayat al-Kursi) splits into its 7 phrases', () => {
    expect(segmentAyah(getAyah(2, 255)).length).toBe(7);
  });

  it('pass-2 (sala secondary splits) is alive: 42:15 yields sala-ended segments', () => {
    const segs = segmentAyah(getAyah(42, 15));
    expect(segs.some((s) => s.endMark === 'ۖ')).toBe(true);
  });

  it('a marked but short ayah (18:5) stays whole at the default threshold', () => {
    expect(segmentAyah(getAyah(18, 5)).length).toBe(1);
  });
});

describe('buildAyahWordData script alignment', () => {
  const surahs = loadAllSurahs();

  it('every segmented ayah keeps aligned tajweed words (split cards never lose tajweed)', () => {
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        if (segmentAyah(ayah).length > 1) {
          expect(buildAyahWordData(ayah).tajweedWords, ayah.key).not.toBeNull();
        }
      }
    }
  });

  it('accepted per-word arrays never contain a bare-mark (letterless) token', () => {
    const letter = /[ء-يٮ-ۓەۮ-ۯۺ-ۿݐ-ݿࢠ-ࢽ]/;
    for (const surah of surahs) {
      for (const ayah of surah.ayahs) {
        const { tajweedWords, indopakWords } = buildAyahWordData(ayah);
        for (const t of tajweedWords ?? []) {
          expect(letter.test(t.replace(/<[^>]+>/g, '')), `${ayah.key} tajweed`).toBe(true);
        }
        for (const t of indopakWords ?? []) {
          expect(letter.test(t), `${ayah.key} indopak`).toBe(true);
        }
      }
    }
  });

  it('2:10 (fused IndoPak words) falls back rather than accepting shifted alignment', () => {
    // Its textIndopak fuses two words into one token, so any accepted per-word array
    // would be positionally shifted — the count check must reject it.
    expect(buildAyahWordData(getAyah(2, 10)).indopakWords).toBeNull();
  });
});

describe('segment printout for owner sign-off', () => {
  it.each([
    [2, 282],
    [2, 255],
    [4, 12],
  ])('surah %i ayah %i', (surahId, ayahNumber) => {
    const ayah = getAyah(surahId, ayahNumber);
    const words = realWords(ayah);
    const segs = segmentAyah(ayah);
    const lines = segs.map((seg) => {
      const text = words
        .slice(seg.wordStart, seg.wordEnd + 1)
        .map((w) => w.textUthmani)
        .join(' ');
      const size = seg.wordEnd - seg.wordStart + 1;
      return `  part ${seg.index + 1}/${seg.count} (${size}w, ends ${seg.endMark ?? 'verse-end'}): ${text}`;
    });
    console.log(`\n${surahId}:${ayahNumber} — ${words.length} words → ${segs.length} segments\n${lines.join('\n')}`);
    expect(segs.length).toBeGreaterThanOrEqual(1);
  });
});
