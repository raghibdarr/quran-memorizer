// Browser loader for the DigitalKhatt mushaf prototype: the HarfBuzz WASM shaper,
// the DigitalKhatt New Madina font (OFL) and the 604-page text, all from
// public/mushaf-dk/ (same origin, so the service worker and the native bundle
// serve them offline). Loaded once per session on first use.

import { HarfBuzz, type HarfBuzzModule, type HBFont } from './harfbuzz';
import { indexPages, type PageIndexEntry } from './text';

export const MUSHAF_DK_BASE = '/mushaf-dk';

export interface MushafDkEngine {
  font: HBFont;
  pages: string[][];
  index: PageIndexEntry[];
  /** Time to fetch, compile and parse everything, ms */
  loadMs: number;
}

type Factory = (m: { wasmBinary: ArrayBuffer }) => Promise<HarfBuzzModule>;
declare global {
  interface Window { createHarfBuzz?: Factory }
}

/** hb.js is emscripten's classic-script glue; it defines window.createHarfBuzz */
function loadGlue(): Promise<Factory> {
  if (window.createHarfBuzz) return Promise.resolve(window.createHarfBuzz);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${MUSHAF_DK_BASE}/hb.js`;
    s.async = true;
    s.onload = () => (window.createHarfBuzz ? resolve(window.createHarfBuzz) : reject(new Error('hb.js loaded without createHarfBuzz')));
    s.onerror = () => reject(new Error('hb.js failed to load'));
    document.head.appendChild(s);
  });
}

const bytes = (path: string) =>
  fetch(`${MUSHAF_DK_BASE}/${path}`).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`);
    return r.arrayBuffer();
  });

let engine: Promise<MushafDkEngine> | null = null;
export function loadMushafDk(): Promise<MushafDkEngine> {
  engine ??= (async () => {
    const t0 = performance.now();
    const [factory, wasmBinary, fontData, pages] = await Promise.all([
      loadGlue(),
      bytes('hb.wasm'),
      bytes('madina.otf'),
      fetch(`${MUSHAF_DK_BASE}/text.json`).then((r) => r.json() as Promise<string[][]>),
    ]);
    const hb = new HarfBuzz(await factory({ wasmBinary }));
    const font = hb.loadFont(new Uint8Array(fontData));
    return { font, pages, index: indexPages(pages), loadMs: performance.now() - t0 };
  })();
  engine.catch(() => { engine = null; });
  return engine;
}
