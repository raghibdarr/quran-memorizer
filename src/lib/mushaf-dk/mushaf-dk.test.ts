import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import meta from '@/data/quran-meta.json';
import index from '@/data/search-index.json';
import { HarfBuzz, type HarfBuzzModule, type HBFont } from './harfbuzz';
import { DEFAULT_FONT_SCALE, layoutPage, LINE_W, type PlacedPage } from './layout';
import { indexPages, LineKind, lineKind, MUSHAF_DK_PAGES, type PageIndexEntry } from './text';

const dir = path.resolve('public/mushaf-dk');
const pages: string[][] = JSON.parse(fs.readFileSync(path.join(dir, 'text.json'), 'utf8'));
const counts = (index as { counts: number[] }).counts;
const pageStarts = (meta as unknown as { page: [number, number][] }).page;

let font: HBFont;
let idx: PageIndexEntry[];

beforeAll(async () => {
  const createHarfBuzz = createRequire(import.meta.url)(path.join(dir, 'hb.js')) as (m: object) => Promise<HarfBuzzModule>;
  const mod = await createHarfBuzz({ wasmBinary: fs.readFileSync(path.join(dir, 'hb.wasm')) });
  font = new HarfBuzz(mod).loadFont(new Uint8Array(fs.readFileSync(path.join(dir, 'madina.otf'))));
  idx = indexPages(pages);
});

describe('DigitalKhatt Madina text', () => {
  it('has 604 pages of 15 lines (8 on the first two)', () => {
    expect(pages.length).toBe(MUSHAF_DK_PAGES);
    expect(pages[0].length).toBe(8);
    expect(pages[1].length).toBe(8);
    expect(pages.slice(2).every((p) => p.length === 15)).toBe(true);
  });

  it('has 114 surah titles and every ayah, numbered in order', () => {
    const titles = pages.flat().filter((l) => lineKind(l) === LineKind.Sura);
    expect(titles.length).toBe(114);
    // Every surah but Al-Fatiha (its basmala is ayah 1) and At-Tawbah
    expect(pages.flat().filter((l) => lineKind(l) === LineKind.Basmala).length).toBe(112);
    // Last marker per surah = its ayah count
    const last = new Map<number, number>();
    for (const p of idx) for (const l of p.lines) for (const w of l.words) if (w.marker) {
      expect(w.ayah).toBe((last.get(w.surah) ?? 0) + 1);
      last.set(w.surah, w.ayah);
    }
    expect([...last.values()]).toEqual(counts);
  });

  it('starts each page on the same ayah as the app\'s page index', () => {
    const diffs: string[] = [];
    idx.forEach((p, i) => {
      // First ayah whose first word is on this page
      let start: [number, number] | null = null;
      for (const l of p.lines) for (const w of l.words) if (!start && w.word === 1) start = [w.surah, w.ayah];
      const want = pageStarts[i];
      if (!start || start[0] !== want[0] || start[1] !== want[1]) diffs.push(`p${i + 1}: ${start} vs ${want}`);
    });
    expect(diffs).toEqual([]);
  });
});

describe('justified layout', () => {
  it('lays page 3 out edge to edge', () => {
    const p = layoutPage(font, pages, 3, idx[2].lines.map((l) => l.words));
    expect(p.lines.length).toBe(15);
    for (const l of p.lines) {
      expect(Math.abs(l.width * l.xScale * l.scale - LINE_W)).toBeLessThan(1);
      expect(l.words.flatMap((w) => w.glyphs).every((g) => g.id !== 0)).toBe(true);
    }
  });

  // The whole book: run with MUSHAF_DK_AUDIT=1 (about a minute); writes .shots/audit.json
  it.skipIf(!process.env.MUSHAF_DK_AUDIT)('audit: every line of all 604 pages', () => {
    const rows: { page: number; line: number; kind: number; target: number; width: number; xScale: number; spaceRatio: number; stretched: number; notdef: number }[] = [];
    const times: number[] = [];
    const space = font.width(' ');
    const mode = (process.env.MUSHAF_DK_OVERFLOW as 'squeeze' | 'tighten') || 'tighten';
    const scale = Number(process.env.MUSHAF_DK_SCALE || DEFAULT_FONT_SCALE);
    for (let pg = 1; pg <= MUSHAF_DK_PAGES; pg++) {
      const p: PlacedPage = layoutPage(font, pages, pg, idx[pg - 1].lines.map((l) => l.words), { overflow: mode, fontScale: scale });
      times.push(p.ms);
      p.lines.forEach((l, li) => {
        const glyphs = l.words.flatMap((w) => w.glyphs);
        // Gaps between words relative to a plain space, from the placed glyph extents
        let gap = 0;
        for (let i = 1; i < l.words.length; i++) gap += l.words[i - 1].x0 - l.words[i].x1;
        const nGaps = Math.max(1, l.words.length - 1);
        rows.push({
          page: pg, line: li + 1, kind: l.kind, target: Math.round(l.target), width: Math.round(l.width * l.scale), xScale: +l.xScale.toFixed(4),
          spaceRatio: +(gap / nGaps / space).toFixed(2), stretched: l.stretched, notdef: glyphs.filter((g) => g.id === 0).length,
        });
      });
    }
    times.sort((a, b) => a - b);
    const text = rows.filter((r) => r.kind === LineKind.Text);
    const summary = {
      mode,
      fontScale: scale,
      spaceWidth: space,
      lines: text.length,
      overflowSqueezed: text.filter((r) => r.xScale < 1).length,
      squeezedOver3pct: text.filter((r) => r.xScale < 0.97).map((r) => `${r.page}:${r.line} x${r.xScale}`),
      notJustified: text.filter((r) => r.xScale === 1 && Math.abs(r.width - r.target) > 2).map((r) => `${r.page}:${r.line} ${r.width}/${r.target}`),
      wideSpaces: text.filter((r) => r.spaceRatio > 3).map((r) => `${r.page}:${r.line} ${r.spaceRatio}`),
      notdef: rows.filter((r) => r.notdef > 0).map((r) => `${r.page}:${r.line}`),
      msMedian: +times[times.length >> 1].toFixed(1),
      msP95: +times[Math.floor(times.length * 0.95)].toFixed(1),
      msMax: +times[times.length - 1].toFixed(1),
    };
    fs.mkdirSync('.shots', { recursive: true });
    fs.writeFileSync(`.shots/audit-${mode}-${scale}.json`, JSON.stringify({ summary, rows }, null, 0));
    console.log(JSON.stringify({ ...summary, wideSpaces: summary.wideSpaces.length, squeezedOver3pct: summary.squeezedOver3pct.length }, null, 1));
    expect(summary.notdef).toEqual([]);
  }, 600_000);
});
