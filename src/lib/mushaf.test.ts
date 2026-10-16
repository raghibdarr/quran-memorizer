import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import meta from '@/data/quran-meta.json';
import index from '@/data/search-index.json';
import { ayahsOnPage, buildPage, featureCss, juzFilesForPage, type JuzFile, MUSHAF_PAGES } from './mushaf';
import { pageOf, type QuranMeta } from './search';

const m = meta as unknown as QuranMeta;
const counts = (index as { counts: number[] }).counts;
const juzFiles: JuzFile[] = Array.from({ length: 30 }, (_, i) =>
  JSON.parse(fs.readFileSync(`public/mushaf/madina-1441h/juz-${String(i + 1).padStart(2, '0')}.json`, 'utf8')));
const juzStartPages = m.juz.map(([s, a]) => pageOf(m, s, a));
const page = (p: number) => buildPage(p, juzFilesForPage(p, juzStartPages).map((j) => juzFiles[j - 1]))!;

describe('mushaf pages', () => {
  it('turns justification features into font-feature-settings', () => {
    expect(featureCss('jp07=1,jp09=12')).toBe('"q071", "q09c"');
    expect(featureCss('')).toBe('');
  });

  it('page 1 is Al-Fatihah: title, then ayahs 1–7 with numbered words', () => {
    const p = page(1);
    expect(new Set(p.lines[0].words.map((w) => w.kind))).toEqual(new Set(['title']));
    expect(ayahsOnPage(p).map((a) => a.ayah)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const first = p.lines[1].words[0];
    expect(first).toMatchObject({ surah: 1, ayah: 1, kind: 'word', wordNo: 1 });
  });

  it('every one of the 604 pages lays out, every ayah appears, and pages start where Tanzil says', () => {
    const seen = new Set<string>();
    for (let n = 1; n <= MUSHAF_PAGES; n++) {
      const p = page(n);
      expect(p, `page ${n}`).not.toBeNull();
      const ayahs = ayahsOnPage(p);
      for (const a of ayahs) seen.add(`${a.surah}:${a.ayah}`);
      const [s, a] = m.page[n - 1];
      expect(ayahs[0], `page ${n} starts`).toEqual({ surah: s, ayah: a });
      for (const line of p.lines) {
        if (line.spec.k === 'text' && line.words.length) {
          expect(line.spec.s?.length, `page ${n} line spacing`).toBe(line.words.length - 1);
        }
      }
    }
    expect(seen.size).toBe(counts.reduce((x, y) => x + y, 0));
  });
});
