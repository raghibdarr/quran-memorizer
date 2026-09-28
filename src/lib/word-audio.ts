import type { Word } from '@/types/quran';

// quran.com's word audio_url numbers files by word POSITION (it counts pause marks as
// their own slots), but the CDN stores word audio CONSECUTIVELY — one file per real
// word, 1..N. For an ayah with an internal pause mark the stored URL points one (or
// more) files too far, playing the NEXT word (and the tail 404s). Renumber by the
// word's consecutive index among real words to hit the correct file.
export function wordAudioUrl(word: Word, index: number): string | null {
  if (!word.audioUrl) return null;
  return word.audioUrl.replace(/_\d+\.mp3$/, `_${String(index + 1).padStart(3, '0')}.mp3`);
}
