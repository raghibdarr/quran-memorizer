// Mushaf page view (roadmap #06): the 604-page Madina mushaf (1441H print) as live
// text. Data and font: quran-madina-html 2.0 (Waqf GPL 2.0) with the DigitalKhatt
// New Madina font (OFL), unchanged in public/mushaf/ — see public/mushaf/NOTICE.txt.
//
// Each juz file holds, per ayah, the page it starts on and its text split into runs
// per line, with every word's stretch features (DigitalKhatt justifies by widening
// letters); and, per page, each line's width, scale and inter-word spacing. Pure
// parsing here; src/components/mushaf/mushaf-page.tsx draws it.

export const MUSHAF_PAGES = 604;
/** A line's full width in em at the base font size */
export const MUSHAF_LINE_WIDTH = 15.4376;

/** The two layouts (both from quran-madina-html; NOTICE.txt): the 1441H Madina print and 15-line IndoPak */
export type MushafLayout = 'madina' | 'indopak';
export const LAYOUTS: Record<MushafLayout, { dir: string; pages: number; lineWidth: number; font: string; label: string }> = {
  madina: { dir: 'madina-1441h', pages: 604, lineWidth: 15.4376, font: 'QMH New Madina', label: 'Madina' },
  indopak: { dir: 'indopak-15', pages: 610, lineWidth: 15.6282, font: 'QMH IndoPak', label: 'IndoPak' },
};

export interface LayoutIndex {
  /** First ayah on each page (1-based page index into the array) */
  pageStarts: [number, number][];
  /** The page each juz starts on */
  juzStartPages: number[];
}

/** Turn a manifest's [sura0, idx] into the first ayah it lands on (titles and basmalas count as ayah 1) */
const ayahOf = (sura0: number, idx: number): [number, number] => [sura0 + 1, Math.max(1, idx - 1)];

const indexCache = new Map<MushafLayout, Promise<LayoutIndex>>();
export function loadLayoutIndex(layout: MushafLayout): Promise<LayoutIndex> {
  let p = indexCache.get(layout);
  if (!p) {
    p = fetch(`/mushaf/${LAYOUTS[layout].dir}/manifest.json`).then((r) => r.json()).then((m: { pages: number[][]; juz: number[][] }) => ({
      pageStarts: m.pages.map(([s0, idx]) => ayahOf(s0, idx)),
      juzStartPages: m.juz.map((j) => j[2]),
    }));
    p.catch(() => indexCache.delete(layout));
    indexCache.set(layout, p);
  }
  return p;
}

export interface LineSpec {
  k: 'sura' | 'bism' | 'text';
  w: number;
  z?: number;
  s?: number[];
  c?: number;
  x?: number;
}

type Run = { l: number; t: string; f: string[] };
type Row = [sura0: number, idx: number, page: number, runs: Run[]];
export interface JuzFile { j: number; d: Row[]; L: Record<string, LineSpec[]> }

export interface MushafWord {
  text: string;
  /** CSS font-feature-settings for this word ('' for none) */
  features: string;
  surah: number;
  /** null for a surah title or basmala line */
  ayah: number | null;
  kind: 'word' | 'marker' | 'title' | 'basmala';
  /** 1-based position among the ayah's words (markers excluded); 0 otherwise */
  wordNo: number;
}

export interface MushafLine { spec: LineSpec; words: MushafWord[] }
export interface MushafPage { page: number; lines: MushafLine[] }

/** "jp07=1,jp09=2" → `"q071", "q092"` (the font's justification features) */
export function featureCss(f: string): string {
  if (!f) return '';
  return f.split(',').map((t) => {
    const [k, v] = t.split('=');
    return `"q${k.slice(2)}${Number(v || 1).toString(36)}"`;
  }).join(', ');
}

/** Lay the rows of one or more juz files onto the given page */
export function buildPage(page: number, files: JuzFile[]): MushafPage | null {
  const spec = files.map((f) => f.L[String(page)]).find(Boolean);
  if (!spec) return null;
  const lines: MushafLine[] = spec.map((s) => ({ spec: s, words: [] }));
  const seen = new Set<string>();
  for (const file of files) {
    for (const [sura0, idx, start, runs] of file.d) {
      const key = `${sura0}:${idx}`;
      if (seen.has(key)) continue; // a row repeated in the next juz's file
      const surah = sura0 + 1;
      const isTitle = idx === 0 || (idx === 1 && sura0 === 0);
      const isBasmala = idx === 1 && sura0 !== 0;
      const ayah = idx >= 2 ? idx - 1 : null;
      let p = start;
      let prev: number | null = null;
      // Word numbers count from the ayah's start, including words on earlier pages
      let wordNo = 0;
      let touched = false;
      for (const run of runs) {
        if (prev !== null && run.l < prev) p++;
        prev = run.l;
        const tokens = run.t.split(' ');
        for (let wi = 0; wi < tokens.length; wi++) {
          const text = tokens[wi];
          if (!text) continue;
          const marker = text.includes('۝');
          const kind: MushafWord['kind'] = isTitle ? 'title' : isBasmala ? 'basmala' : marker ? 'marker' : 'word';
          if (kind === 'word') wordNo++;
          if (p !== page) continue;
          touched = true;
          lines[run.l - 1]?.words.push({ text, features: featureCss(run.f[wi] ?? ''), surah, ayah, kind, wordNo: kind === 'word' ? wordNo : 0 });
        }
      }
      if (touched) seen.add(key);
    }
  }
  return { page, lines };
}

/** The juz files a page's rows live in: the juz it starts in, and the next when a juz begins mid-page */
export function juzFilesForPage(page: number, juzStartPages: number[], pages = MUSHAF_PAGES): number[] {
  const out: number[] = [];
  for (let j = 0; j < juzStartPages.length; j++) {
    const first = juzStartPages[j];
    const last = j + 1 < juzStartPages.length ? juzStartPages[j + 1] : pages;
    if (page >= first && page <= last) out.push(j + 1);
  }
  return out;
}

/** The first ayah on a page, and every ayah that appears on it */
export function ayahsOnPage(p: MushafPage): { surah: number; ayah: number }[] {
  const seen = new Set<string>();
  const out: { surah: number; ayah: number }[] = [];
  for (const line of p.lines) for (const w of line.words) {
    if (w.ayah === null) continue;
    const k = `${w.surah}:${w.ayah}`;
    if (!seen.has(k)) { seen.add(k); out.push({ surah: w.surah, ayah: w.ayah }); }
  }
  return out;
}

const cache = new Map<string, Promise<JuzFile>>();
export function loadJuzFile(j: number, layout: MushafLayout = 'madina'): Promise<JuzFile> {
  const key = `${layout}/${j}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/mushaf/${LAYOUTS[layout].dir}/juz-${String(j).padStart(2, '0')}.json`).then((r) => {
      if (!r.ok) throw new Error(`juz ${j}: HTTP ${r.status}`);
      return r.json() as Promise<JuzFile>;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}
