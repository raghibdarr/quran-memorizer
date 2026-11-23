// Lays out one Madina page as positioned glyphs: shape each line with HarfBuzz,
// justify it to the print's width (justify.ts), and place it on a page whose
// geometry follows digitalkhatt.org (page 16200 x 26047 units with a 1000-unit
// font, 15 lines 1715 units apart). Pure: the caller draws the result.

import type { HBFont, HBFeature } from './harfbuzz';
import { analyzeLine, FONTSIZE, justifyLine, SpaceType, type JustResultByLine, type LineTextInfo } from './justify';
import { adjustText, LineKind, lineKind, lineWidthRatio, type WordRef } from './text';

/** Page geometry in font units (digitalkhatt.org: font size = page width / 16.2, margins 400/17000) */
export const PAGE_W = 16200;
const SCALE = PAGE_W / 17000;
export const MARGIN = 400 * SCALE;
export const LINE_W = PAGE_W - 2 * MARGIN; // 15437.6, the justified line width
export const INTERLINE = 1800 * SCALE;
export const TOP = 200 * SCALE;
export const PAGE_H = Math.round((PAGE_W * 410) / 255);

export interface PlacedGlyph {
  id: number;
  /** Glyph origin in font units, relative to the line's right edge and baseline (x leftward is negative, y up) */
  x: number;
  y: number;
  /** Ayah marker (frame and digits) */
  marker: boolean;
}

export interface PlacedWord {
  glyphs: PlacedGlyph[];
  ref: WordRef | null;
  /** Horizontal extent in the line's units, x0 < x1 <= 0 (for highlights / hiding) */
  x0: number;
  x1: number;
}

export interface PlacedLine {
  kind: LineKind;
  text: string;
  /** Baseline y */
  y: number;
  /** Horizontal squeeze applied around the line's right edge (1 = none) */
  xScale: number;
  /** Glyph scale (sura titles and basmalas are drawn a little smaller) */
  scale: number;
  words: PlacedWord[];
  /** Right edge x of the ink and its natural width before squeezing */
  right: number;
  width: number;
  /** The width the line was justified to (0 for centred lines) */
  target: number;
  /** Extra stretch letters received (number of characters with justification features) */
  stretched: number;
}

export interface PlacedPage {
  page: number;
  lines: PlacedLine[];
  ms: number;
}

const isDigit = (c: number) => c >= 0x0660 && c <= 0x0669;

function shapeAndPlace(
  font: HBFont,
  info: LineTextInfo,
  just: JustResultByLine,
  features: HBFeature[],
  refs: WordRef[] | null,
): { words: PlacedWord[]; width: number; spaceGlyphs: number } {
  const text = info.lineText;
  const glyphs = font.shape(text, features);
  // Glyph cluster → word index
  const wordOf = new Int32Array(text.length + 1).fill(-1);
  info.wordInfos.forEach((w, wi) => { for (let i = w.startIndex; i <= w.endIndex; i++) wordOf[i] = wi; });
  const words: PlacedWord[] = info.wordInfos.map((_, wi) => ({ glyphs: [], ref: refs?.[wi] ?? null, x0: Infinity, x1: -Infinity }));
  let x = 0;
  let spaceGlyphs = 0;
  // HarfBuzz returns RTL glyphs in visual (left-to-right) order: walk from the right
  for (let gi = glyphs.length - 1; gi >= 0; gi--) {
    const g = glyphs[gi];
    const space = info.spaces.get(g.cluster);
    const before = x;
    if (space === SpaceType.Aya) x -= just.ayaSpacing;
    else if (space === SpaceType.Simple) x -= just.simpleSpacing;
    else x -= g.xAdvance;
    const wi = wordOf[g.cluster];
    if (space) spaceGlyphs++;
    if (space || wi < 0) continue;
    const c = text.charCodeAt(g.cluster);
    const w = words[wi];
    w.glyphs.push({ id: g.glyphId, x: x + g.xOffset, y: g.yOffset, marker: c === 0x06dd || isDigit(c) });
    w.x0 = Math.min(w.x0, x);
    w.x1 = Math.max(w.x1, before);
  }
  return { words, width: -x, spaceGlyphs };
}

export interface LayoutOptions {
  /**
   * How to fit a line longer than the measure. 'squeeze' is digitalkhatt.org's
   * hb route (scale the line horizontally); 'tighten' (default) first closes up
   * the plain spaces (not those around ayah markers), squeezing only the rest.
   */
  overflow?: 'squeeze' | 'tighten';
  /**
   * Text size relative to digitalkhatt.org's (font = page width / 16.2). This
   * font's letters run wider than the print's, so about half the lines are too
   * long at 1; a slightly smaller size leaves most of them to the kashidas.
   */
  fontScale?: number;
}

export const DEFAULT_FONT_SCALE = 0.92;
/** A basmala line's width, as a share of the full line */
const BASMALA_WIDTH = 0.62;

/** Lay out page `page` (1-based) of `pages` */

export function layoutPage(font: HBFont, pages: string[][], page: number, refs?: (WordRef[] | null)[], opts: LayoutOptions = {}): PlacedPage {
  const t0 = performance.now();
  const lines = pages[page - 1].map(adjustText);
  const spaceWidth = font.width(' ');
  const firstPages = page <= 2;
  // Pages 1 and 2 hold 8 lines plus a two-line gap after the title, centred in the ornament
  const top = firstPages ? TOP + INTERLINE * ((15 - lines.length - 2) / 2) : TOP;
  const out: PlacedLine[] = [];

  lines.forEach((text, li) => {
    const kind = lineKind(text);
    const extra = firstPages && li > 0 ? 2 : 0;
    const y = top + INTERLINE * (li + extra) + INTERLINE * 0.62;
    const lineRefs = refs?.[li] ?? null;

    // Basmala lines are justified to part of the width, as in the print (the
    // font's own 'basm' form spreads the four words across the whole line)
    const basmala = kind === LineKind.Basmala && !firstPages;
    if (kind === LineKind.Text || basmala || (firstPages && li === 1)) {
      const ratio = basmala ? BASMALA_WIDTH : lineWidthRatio(page, li + 1);
      const target = LINE_W * ratio;
      const z = opts.fontScale ?? DEFAULT_FONT_SCALE;
      // The first two pages' basmala lines use the font's own basmala forms
      const lineFeatures: HBFeature[] | null = firstPages && li === 1 ? [{ tag: 'bism', value: 1, start: 0, end: -1 }] : null;
      const info = analyzeLine(text, lineFeatures);
      // Justify in font units at size z: the measure is target / z units long
      const just = justifyLine(info, font, target / z, spaceWidth, { tighten: opts.overflow !== 'squeeze' });
      const features: HBFeature[] = lineFeatures ? [...lineFeatures] : [];
      let stretched = 0;
      for (const [i, feats] of just.fontFeatures) {
        stretched++;
        for (const f of feats) features.push({ tag: f.name, value: f.value, start: i, end: i + 1 });
      }
      const first = shapeAndPlace(font, info, just, features, lineRefs);
      let { words, width } = first;
      const { spaceGlyphs } = first;
      // Now and then the shaper folds a space into a neighbouring glyph (or the
      // line's glyph widths differ a little from the per-word sums), leaving the
      // line a space short or long: spread the difference over the spaces drawn
      const off = target / z - width * just.xScale;
      if (Math.abs(off) > 1 && spaceGlyphs > 0 && just.xScale === 1) {
        const d = off / spaceGlyphs;
        ({ words, width } = shapeAndPlace(font, info, { ...just, simpleSpacing: just.simpleSpacing + d, ayaSpacing: just.ayaSpacing + d }, features, lineRefs));
      }
      const right = PAGE_W - MARGIN - (LINE_W - target) / 2;
      out.push({ kind: basmala ? LineKind.Basmala : LineKind.Text, text, y, xScale: just.xScale, scale: z, words, right, width, target, stretched });
    } else {
      // Surah title: centred, at 90%
      const scale = 0.9;
      const features: HBFeature[] = [];
      const info = analyzeLine(text, null);
      const just: JustResultByLine = { fontFeatures: new Map(), simpleSpacing: spaceWidth, ayaSpacing: spaceWidth, xScale: 1 };
      const { words, width } = shapeAndPlace(font, info, just, features, null);
      const right = PAGE_W / 2 + (width * scale) / 2;
      out.push({ kind, text, y, xScale: 1, scale, words, right, width, target: 0, stretched: 0 });
    }
  });
  return { page, lines: out, ms: performance.now() - t0 };
}

export { FONTSIZE };
