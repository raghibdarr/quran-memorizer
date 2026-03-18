import type { Surah, SurahMeta, Ayah } from '@/types/quran';

const surahCache = new Map<number, Surah>();

export async function getSurahIndex(): Promise<SurahMeta[]> {
  const data = await import('@/data/surahs-index.json');
  return data.default as SurahMeta[];
}

export async function getSurah(id: number): Promise<Surah> {
  if (surahCache.has(id)) return surahCache.get(id)!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let raw: any;
  switch (id) {
    case 1: raw = await import('@/data/surah-1.json'); break;
    case 103: raw = await import('@/data/surah-103.json'); break;
    case 108: raw = await import('@/data/surah-108.json'); break;
    case 110: raw = await import('@/data/surah-110.json'); break;
    case 111: raw = await import('@/data/surah-111.json'); break;
    case 112: raw = await import('@/data/surah-112.json'); break;
    case 113: raw = await import('@/data/surah-113.json'); break;
    case 114: raw = await import('@/data/surah-114.json'); break;
    default: throw new Error(`Surah ${id} not available`);
  }

  const surah = (raw.default ?? raw) as Surah;
  surahCache.set(id, surah);
  return surah;
}

export async function getAyah(surahId: number, ayahNumber: number): Promise<Ayah> {
  const surah = await getSurah(surahId);
  const ayah = surah.ayahs.find(a => a.number === ayahNumber);
  if (!ayah) throw new Error(`Ayah ${surahId}:${ayahNumber} not found`);
  return ayah;
}

export function getAudioUrl(surahId: number, ayahNumber: number, reciter = 'Alafasy_128kbps'): string {
  const s = surahId.toString().padStart(3, '0');
  const a = ayahNumber.toString().padStart(3, '0');
  return `https://everyayah.com/data/${reciter}/${s}${a}.mp3`;
}
