// Builds the recitation player's queue (roadmap #01). Pure: no audio, no fetches.
//
// Per-ayah reciters (EveryAyah) get one file per ayah. Surah-audio reciters (QUD)
// get slices of the surah file; when nothing repeats or pauses, consecutive ayahs
// of a surah merge into ONE slice, so a surah plays straight through without a
// single gap. Repeats are expanded here (one item per play) so the native player
// never needs to know about ayahs.

import { getAudioUrl } from './quran-data';

export interface AyahRef { surah: number; ayah: number }

/** public/segments/<reciter>/audio-index.json (scripts/build-surah-audio-index.mjs) */
export interface SurahAudioIndex {
  src: (string | null)[];
  verses: ([number, number] | null)[][];
}

export interface QueueItem {
  url: string;
  startMs: number;
  /** null: to the end of the file */
  endMs: number | null;
  surah: number;
  ayahFrom: number;
  ayahTo: number;
  /** 0-based play of this ayah (repeats) */
  rep: number;
  title: string;
  subtitle: string;
  tag: string;
}

export interface QueueOptions {
  reciter: string;
  reciterName: string;
  /** Present for surah-audio reciters */
  surahAudio: SurahAudioIndex | null;
  /** Per-ayah collection that fills a surah-audio reciter's missing ayahs */
  fallbackReciter: string;
  repeatEach: number;
  /** Merge consecutive ayahs into one slice (only when nothing repeats or pauses) */
  merge: boolean;
  surahName: (surah: number) => string;
  /** Swap in a downloaded copy of a file, if there is one */
  localUrl?: (url: string) => string;
}

export function buildQueue(ayahs: AyahRef[], o: QueueOptions): QueueItem[] {
  const local = o.localUrl ?? ((u: string) => u);
  const out: QueueItem[] = [];
  const times = Math.max(1, o.repeatEach);
  for (const { surah, ayah } of ayahs) {
    const span = o.surahAudio?.verses[surah - 1]?.[ayah - 1] ?? null;
    const src = o.surahAudio?.src[surah - 1] ?? null;
    const base = span && src
      ? { url: local(src), startMs: span[0], endMs: span[1] as number | null }
      : { url: local(getAudioUrl(surah, ayah, o.surahAudio ? o.fallbackReciter : o.reciter)), startMs: 0, endMs: null };

    const prev = out[out.length - 1];
    if (o.merge && times === 1 && prev && span && prev.url === base.url && prev.surah === surah
      && prev.ayahTo === ayah - 1 && prev.endMs != null) {
      prev.endMs = base.endMs;
      prev.ayahTo = ayah;
      prev.tag = `${surah}:${prev.ayahFrom}-${ayah}#0`;
      prev.title = o.surahName(surah);
      continue;
    }
    for (let rep = 0; rep < times; rep++) {
      out.push({
        ...base,
        surah,
        ayahFrom: ayah,
        ayahTo: ayah,
        rep,
        title: `${o.surahName(surah)} · ${ayah}`,
        subtitle: o.reciterName,
        tag: `${surah}:${ayah}-${ayah}#${rep}`,
      });
    }
  }
  return out;
}

/** Which ayah is playing `positionMs` into a (possibly merged) item */
export function ayahAt(item: QueueItem, positionMs: number, index: SurahAudioIndex | null): number {
  if (item.ayahFrom === item.ayahTo || !index) return item.ayahFrom;
  const abs = item.startMs + positionMs;
  const spans = index.verses[item.surah - 1] ?? [];
  let current = item.ayahFrom;
  for (let a = item.ayahFrom; a <= item.ayahTo; a++) {
    const span = spans[a - 1];
    if (span && span[0] <= abs) current = a;
    else if (span) break;
  }
  return current;
}

/** ms into the given ayah's own recording, for word highlighting */
export function msIntoAyah(item: QueueItem, positionMs: number, ayah: number, index: SurahAudioIndex | null): number {
  if (!index || (item.endMs == null && item.startMs === 0)) return positionMs;
  const span = index.verses[item.surah - 1]?.[ayah - 1];
  return span ? item.startMs + positionMs - span[0] : positionMs;
}

export type PlayUntil = 'surah' | 'juz' | 'page' | 'quran';

/**
 * The ayahs from `start` up to the end of its surah / juz / page / the Quran.
 * `counts` = ayahs per surah; `juzStarts` / `pageStarts` = [surah, ayah] starts.
 */
export function rangeUntil(
  start: AyahRef,
  until: PlayUntil,
  counts: number[],
  juzStarts: [number, number][],
  pageStarts: [number, number][],
): AyahRef[] {
  const end = endOf(start, until, counts, juzStarts, pageStarts);
  const out: AyahRef[] = [];
  let s = start.surah;
  let a = start.ayah;
  while (s < end.surah || (s === end.surah && a <= end.ayah)) {
    out.push({ surah: s, ayah: a });
    if (a < counts[s - 1]) a++;
    else { s++; a = 1; }
    if (s > counts.length) break;
  }
  return out;
}

function endOf(start: AyahRef, until: PlayUntil, counts: number[], juzStarts: [number, number][], pageStarts: [number, number][]): AyahRef {
  if (until === 'surah') return { surah: start.surah, ayah: counts[start.surah - 1] };
  if (until === 'quran') return { surah: counts.length, ayah: counts[counts.length - 1] };
  const starts = until === 'juz' ? juzStarts : pageStarts;
  // The first boundary after `start`, minus one ayah
  for (const [s, a] of starts) {
    if (s > start.surah || (s === start.surah && a > start.ayah)) {
      return a > 1 ? { surah: s, ayah: a - 1 } : { surah: s - 1, ayah: counts[s - 2] };
    }
  }
  return { surah: counts.length, ayah: counts[counts.length - 1] };
}
