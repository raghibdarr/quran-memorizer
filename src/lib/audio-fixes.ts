// Per-ayah reciters whose EveryAyah files are misfiled (one holds the next ayah, two ayahs,
// or part of one): public/segments/<reciter>/audio-fixes.json maps "<surah>:<ayah>" to the
// slice that really holds it, [srcUrl, startMs, endMs]. Found by the aligner's file check
// and written by scripts/apply-audio-fixes.mjs; word timings for those ayahs are relative
// to the slice start.

import { hasAudioFixes } from './reciters';

export type AudioFix = [src: string, startMs: number, endMs: number];
export type AudioFixes = Record<string, AudioFix>;

const cache = new Map<string, Promise<AudioFixes | null>>();

export function loadAudioFixes(reciter: string): Promise<AudioFixes | null> {
  if (!hasAudioFixes(reciter)) return Promise.resolve(null);
  let p = cache.get(reciter);
  if (!p) {
    p = fetch(`/segments/${reciter}/audio-fixes.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    // A failed fetch (offline) shouldn't stick
    p.then((v) => { if (!v) cache.delete(reciter); });
    cache.set(reciter, p);
  }
  return p;
}
