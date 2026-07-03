import type { AyahSegment } from './segments';

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

/** everyayah reciter directories with word-level timing data exported */
const SEGMENT_AUDIO_RECITERS = new Set([
  'Alafasy_128kbps',
  'Husary_128kbps',
  'Abdul_Basit_Murattal_192kbps',
  'Minshawy_Murattal_128kbps',
  'Yasser_Ad-Dussary_128kbps',
  'MaherAlMuaiqly128kbps',
]);

export function hasSegmentAudio(reciterId: string): boolean {
  return SEGMENT_AUDIO_RECITERS.has(reciterId);
}

/** [word_1based, start_ms, end_ms] — word numbering matches realWords() + 1 */
type WordTiming = [number, number, number];
/** ayahNumber (as string key) -> word timings for that ayah */
export type SurahTimings = Record<string, WordTiming[]>;

const timingsCache = new Map<string, Promise<SurahTimings | null>>();

/** Lazy-load (and memoize) one surah's word timings for a reciter; null = unavailable */
export function loadSegmentTimings(reciterId: string, surahId: number): Promise<SurahTimings | null> {
  if (!hasSegmentAudio(reciterId)) return Promise.resolve(null);
  const key = `${reciterId}/${surahId}`;
  let entry = timingsCache.get(key);
  if (!entry) {
    entry = fetch(`/segments/${reciterId}/${surahId}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<SurahTimings>) : null))
      .catch(() => null);
    timingsCache.set(key, entry);
  }
  return entry;
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
