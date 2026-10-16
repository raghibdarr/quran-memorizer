// Surah-audio reciters (QUD): every surah file's URL and each ayah's [startMs, endMs]
// inside it, one small file per reciter (scripts/build-surah-audio-index.mjs).

import { isSurahAudio } from './reciters';
import type { SurahAudioIndex } from './recitation-queue';

const cache = new Map<string, Promise<SurahAudioIndex | null>>();

export function loadAudioIndex(reciter: string): Promise<SurahAudioIndex | null> {
  if (!isSurahAudio(reciter)) return Promise.resolve(null);
  let p = cache.get(reciter);
  if (!p) {
    p = fetch(`/segments/${reciter}/audio-index.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    // A failed fetch (offline) shouldn't stick
    p.then((v) => { if (!v) cache.delete(reciter); });
    cache.set(reciter, p);
  }
  return p;
}
