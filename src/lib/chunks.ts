import type { Word, Chunk } from '@/types/quran';

export function generateChunks(ayahKey: string, words: Word[]): Chunk[] {
  // Filter out end markers
  const actualWords = words.filter(w => w.charType === 'word');
  const chunks: Chunk[] = [];
  let i = 0;

  while (i < actualWords.length) {
    const remaining = actualWords.length - i;
    const chunkSize =
      remaining <= 4 ? remaining :
      remaining <= 6 ? Math.ceil(remaining / 2) :
      3;

    chunks.push({
      id: `chunk-${ayahKey}-${chunks.length}`,
      words: actualWords.slice(i, i + chunkSize),
      position: chunks.length,
    });
    i += chunkSize;
  }

  return chunks;
}
