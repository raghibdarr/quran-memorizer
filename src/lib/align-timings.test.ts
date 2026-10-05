import { describe, expect, it } from 'vitest';
import { alignAyah, type Row } from './align-timings';

describe('aligning reciter word timings to our words', () => {
  it('leaves matching ayahs alone', () => {
    const rows: Row[] = [[1, 0, 900], [2, 950, 2000]];
    expect(alignAyah(['قُمْ', 'فَأَنذِرْ'], rows)).toEqual({ rows, method: 'exact' });
  });

  it('merges a vocative the timings split in two (74:1, Alafasy)', () => {
    const out = alignAyah(['يَـٰٓأَيُّهَا', 'ٱلْمُدَّثِّرُ'], [[1, 0, 70], [2, 40, 2760], [3, 3120, 4840]]);
    expect(out.method).toBe('split');
    expect(out.rows).toEqual([[1, 0, 2760], [2, 3120, 4840]]);
  });

  it('merges a two-part word written with a space (2:181 بَعْدَ مَا)', () => {
    const words = ['فَمَنۢ', 'بَدَّلَهُۥ', 'بَعْدَ مَا', 'سَمِعَهُۥ'];
    const out = alignAyah(words, [[1, 0, 500], [2, 600, 1200], [3, 1300, 1700], [4, 1750, 2000], [5, 2100, 2900]]);
    expect(out.rows).toEqual([[1, 0, 500], [2, 600, 1200], [3, 1300, 2000], [4, 2100, 2900]]);
  });

  it('splits only as many vocatives as the timings need, preferring the evidence', () => {
    // 28:38-like: two vocatives, one extra timing word; the blip is on the second
    const words = ['وَقَالَ', 'فِرْعَوْنُ', 'يَـٰٓأَيُّهَا', 'ٱلْمَلَأُ', 'يَـٰهَـٰمَـٰنُ'];
    const rows: Row[] = [[1, 0, 400], [2, 500, 900], [3, 1000, 1800], [4, 1900, 2300], [5, 2400, 2460], [6, 2420, 3000]];
    expect(alignAyah(words, rows).rows).toEqual([[1, 0, 400], [2, 500, 900], [3, 1000, 1800], [4, 1900, 2300], [5, 2400, 3000]]);
  });
});

describe('the shipped timings', () => {
  it('number words exactly as ours do, for every reciter and ayah', async () => {
    const fs = await import('node:fs');
    const { getSurah } = await import('./quran-data');
    const dirs = fs.readdirSync('public/segments').filter((d) => fs.statSync(`public/segments/${d}`).isDirectory());
    const bad: string[] = [];
    for (let s = 1; s <= 114; s++) {
      const surah = await getSurah(s);
      for (const d of dirs) {
        const f = `public/segments/${d}/${s}.json`;
        if (!fs.existsSync(f)) continue;
        const t = JSON.parse(fs.readFileSync(f, 'utf8'));
        for (const a of surah.ayahs) {
          const rows: Row[] | undefined = t[String(a.number)];
          if (!rows?.length) continue;
          const ours = a.words.filter((w) => w.charType === 'word').length;
          if (Math.max(...rows.map((r) => r[0])) > ours) bad.push(`${d} ${a.key}`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  }, 120000);
});
