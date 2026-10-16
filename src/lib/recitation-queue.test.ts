import { describe, expect, it } from 'vitest';
import meta from '@/data/quran-meta.json';
import index from '@/data/search-index.json';
import { ayahAt, buildQueue, msIntoAyah, rangeUntil, type SurahAudioIndex } from './recitation-queue';

const counts = (index as { counts: number[] }).counts;
const juz = (meta as unknown as { juz: [number, number][] }).juz;
const page = (meta as unknown as { page: [number, number][] }).page;
const names = (s: number) => `S${s}`;

// Surah 1 in one file, ayah 3 missing from the timings
const qud: SurahAudioIndex = {
  src: ['https://x/001.mp3', ...Array(113).fill(null)],
  verses: [[[0, 5000], [5000, 9000], null, [12000, 15000], [15000, 18000], [18000, 22000], [22000, 30000]], ...Array(113).fill([])],
};
const fatihah = Array.from({ length: 7 }, (_, i) => ({ surah: 1, ayah: i + 1 }));

describe('buildQueue', () => {
  it('per-ayah reciters: one EveryAyah file per play, repeats expanded', () => {
    const q = buildQueue(fatihah.slice(0, 2), { reciter: 'Alafasy_128kbps', reciterName: 'Alafasy', surahAudio: null, fallbackReciter: 'x', repeatEach: 3, merge: false, surahName: names });
    expect(q).toHaveLength(6);
    expect(q[0]).toMatchObject({ url: 'https://everyayah.com/data/Alafasy_128kbps/001001.mp3', startMs: 0, endMs: null, rep: 0 });
    expect(q[5]).toMatchObject({ ayahFrom: 2, rep: 2, tag: '1:2-2#2' });
  });

  it('surah audio: merges consecutive ayahs into one gapless slice, and falls back for missing ones', () => {
    const q = buildQueue(fatihah, { reciter: 'qud-x', reciterName: 'X', surahAudio: qud, fallbackReciter: 'Alafasy_128kbps', repeatEach: 1, merge: true, surahName: names });
    expect(q.map((i) => [i.ayahFrom, i.ayahTo])).toEqual([[1, 2], [3, 3], [4, 7]]);
    expect(q[0]).toMatchObject({ url: 'https://x/001.mp3', startMs: 0, endMs: 9000 });
    expect(q[1].url).toBe('https://everyayah.com/data/Alafasy_128kbps/001003.mp3');
    expect(q[2]).toMatchObject({ startMs: 12000, endMs: 30000 });
  });

  it("doesn't merge when ayahs repeat", () => {
    const q = buildQueue(fatihah.slice(0, 2), { reciter: 'qud-x', reciterName: 'X', surahAudio: qud, fallbackReciter: 'A', repeatEach: 2, merge: true, surahName: names });
    expect(q.map((i) => i.tag)).toEqual(['1:1-1#0', '1:1-1#1', '1:2-2#0', '1:2-2#1']);
  });

  it('uses a downloaded copy when there is one', () => {
    const q = buildQueue(fatihah.slice(0, 1), { reciter: 'A', reciterName: 'A', surahAudio: null, fallbackReciter: 'A', repeatEach: 1, merge: true, surahName: names, localUrl: (u) => `file://${u.slice(-10)}` });
    expect(q[0].url).toBe('file://001001.mp3');
  });
});

describe('ayahAt / msIntoAyah', () => {
  const [merged] = buildQueue(fatihah.slice(3), { reciter: 'q', reciterName: 'X', surahAudio: qud, fallbackReciter: 'A', repeatEach: 1, merge: true, surahName: names });
  it('finds the ayah playing inside a merged slice', () => {
    expect(ayahAt(merged, 0, qud)).toBe(4);
    expect(ayahAt(merged, 3500, qud)).toBe(5);
    expect(ayahAt(merged, 17999, qud)).toBe(7);
  });
  it("gives the time into that ayah's own recording", () => {
    expect(msIntoAyah(merged, 3500, 5, qud)).toBe(500);
  });
});

describe('rangeUntil', () => {
  it('to the end of the surah, juz, page and Quran', () => {
    expect(rangeUntil({ surah: 112, ayah: 2 }, 'surah', counts, juz, page)).toHaveLength(3);
    const toJuzEnd = rangeUntil({ surah: 2, ayah: 140 }, 'juz', counts, juz, page);
    expect(toJuzEnd[toJuzEnd.length - 1]).toEqual({ surah: 2, ayah: 141 });
    const toPageEnd = rangeUntil({ surah: 2, ayah: 1 }, 'page', counts, juz, page);
    expect(toPageEnd).toHaveLength(5);
    const crossing = rangeUntil({ surah: 77, ayah: 50 }, 'juz', counts, juz, page);
    expect(crossing).toEqual([{ surah: 77, ayah: 50 }]);
    expect(rangeUntil({ surah: 113, ayah: 1 }, 'quran', counts, juz, page)).toHaveLength(11);
  });
});
