import { audioController } from './audio';
import { getAudioUrl } from './quran-data';
import { hasWordTimings } from './reciters';
import { loadSegmentTimings, segmentRangeMs } from './segment-audio';

/** Word audio comes from this reciter when the chosen one has no word timings */
const FALLBACK_RECITER = 'Alafasy_128kbps';

/**
 * Plays one word on its own, cut out of the reciter's recording of the ayah by its word
 * timings. (It used to be a separate file per word on audio.qurancdn.com, which Quran
 * Foundation's terms don't let us ship: licensing audit, 2026-10-16.) Resolves false when
 * there's nothing to play: no timings for the word, or offline before they've loaded.
 */
export async function playWordAudio(surahId: number, ayahNumber: number, wordIndex: number, reciterId: string): Promise<boolean> {
  return playWordsAudio(surahId, ayahNumber, wordIndex, wordIndex, reciterId);
}

/** A run of words (0-based, inclusive) cut from the ayah recording, as playWordAudio */
export async function playWordsAudio(surahId: number, ayahNumber: number, from: number, to: number, reciterId: string): Promise<boolean> {
  const id = hasWordTimings(reciterId) ? reciterId : FALLBACK_RECITER;
  const timings = await loadSegmentTimings(id, surahId);
  if (!timings) return false;
  const range = segmentRangeMs(timings, ayahNumber, { index: 0, count: 1, wordStart: from, wordEnd: to, endMark: null });
  if (!range) return false;
  await audioController.playRange(getAudioUrl(surahId, ayahNumber, id), range.startMs, range.endMs);
  return true;
}
