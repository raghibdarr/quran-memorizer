import type { AyahSegment } from './segments';
import { hasWordTimings } from './reciters';

// === Segment audio: word-level timestamps into the per-ayah recordings ===
//
// Static per-surah timing files exported once from QUL (Tarteel) live in
// public/segments/{everyayahDir}/{surah}.json — see scripts/export-segments.mjs and
// .claude/plans/ayah-segmentation-waqf.md (Phase C) for provenance, verification and
// licensing (QUL/Tarteel + quran-align CC BY 4.0 attribution required).
//
// Timestamps are relative to the exact everyayah per-ayah mp3 Takrar already plays
// (byte-identity sampled-verified per reciter in public/segments/manifest.json), so a
// segment's audio is just audioController.playRange(ayahUrl, startMs, endMs).
//
// Surah-audio reciters (Qur'anic Universal Audio, scripts/import-qud.mts) use the same
// files, still timed from each ayah's start, plus an `_audio` map of where every ayah
// sits in the reciter's surah mp3; the audio controller plays that slice.

/** Whether word timings exist for this reciter (QUL per-ayah or QUD surah audio) */
export function hasSegmentAudio(reciterId: string): boolean {
  return hasWordTimings(reciterId);
}

/** [word_1based, start_ms, end_ms] — word numbering matches realWords() + 1, ms from the ayah's start */
type WordTiming = [number, number, number];
/** ayahNumber (as string key) -> word timings for that ayah */
export type SurahTimings = Record<string, WordTiming[]>;
/** Surah-audio reciters (QUD): the surah file, and each ayah's [startMs, endMs] inside it */
export interface SurahAudio { src: string; verses: Record<string, [number, number]> }

type SurahFile = { timings: SurahTimings; audio: SurahAudio | null };
const fileCache = new Map<string, Promise<SurahFile | null>>();

function loadSurahFile(reciterId: string, surahId: number): Promise<SurahFile | null> {
  if (!hasWordTimings(reciterId)) return Promise.resolve(null);
  const key = `${reciterId}/${surahId}`;
  let entry = fileCache.get(key);
  if (!entry) {
    entry = fetch(`/segments/${reciterId}/${surahId}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((raw) => {
        if (!raw) return null;
        const { _audio, ...timings } = raw as SurahTimings & { _audio?: SurahAudio };
        return { timings: timings as SurahTimings, audio: _audio ?? null };
      })
      .catch(() => null);
    // a failed fetch (offline) shouldn't stick: let the next call try again
    entry.then((v) => { if (!v) fileCache.delete(key); });
    fileCache.set(key, entry);
  }
  return entry;
}

/** Lazy-load (and memoize) one surah's word timings for a reciter; null = unavailable */
export function loadSegmentTimings(reciterId: string, surahId: number): Promise<SurahTimings | null> {
  return loadSurahFile(reciterId, surahId).then((f) => f?.timings ?? null);
}

/** Where each ayah sits in a surah-audio reciter's surah file; null for per-ayah reciters */
export function loadSurahAudio(reciterId: string, surahId: number): Promise<SurahAudio | null> {
  return loadSurahFile(reciterId, surahId).then((f) => f?.audio ?? null);
}

// Slicing pads: breathe room before the first word onset / after the last word decay.
const PAD_BEFORE_MS = 100;
const PAD_AFTER_MS = 150;

/**
 * The [startMs, endMs] range covering a waqf segment (words wordStart..wordEnd,
 * 0-based over real words) within its ayah's recording. Machine alignment can miss
 * ~1% of words, so boundaries expand inward to the nearest present word. Returns
 * null when timings can't cover the segment — caller falls back to the full ayah.
 */
export function segmentRangeMs(
  timings: SurahTimings,
  ayahNumber: number,
  seg: AyahSegment,
): { startMs: number; endMs: number } | null {
  const rows = timings[String(ayahNumber)];
  if (!rows?.length) return null;
  const first = seg.wordStart + 1; // to 1-based
  const last = seg.wordEnd + 1;

  let start: number | null = null;
  for (const [word, s] of rows) {
    if (word >= first) { start = s; break; }
  }
  let end: number | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const [word, , e] = rows[i];
    if (word <= last) { end = e; break; }
  }
  if (start == null || end == null || end <= start) return null;
  return { startMs: Math.max(0, start - PAD_BEFORE_MS), endMs: end + PAD_AFTER_MS };
}

/**
 * Which word (0-based over real words) is being recited at `ms` into the ayah's
 * recording, or -1 before the first word. Between words it stays on the word just
 * finished (the highlight shouldn't flicker off in a breath or elongation gap).
 */
export function wordAtTime(ayahTimings: [number, number, number][] | undefined, ms: number): number {
  if (!ayahTimings?.length) return -1;
  let current = -1;
  for (const [word1, start] of ayahTimings) {
    if (start <= ms) current = word1 - 1;
    else break;
  }
  return current;
}
