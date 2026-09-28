import type { Surah, SurahMeta, Ayah, LessonDef, JuzMeta } from '@/types/quran';
import { generateLessons, generateLessonsWithJuzBoundaries } from './curriculum';

const surahCache = new Map<number, Surah>();
let juzIndexCache: JuzMeta[] | null = null;

export async function getSurahIndex(): Promise<SurahMeta[]> {
  const data = await import('@/data/surahs-index.json');
  return data.default as SurahMeta[];
}

export async function getJuzIndex(): Promise<JuzMeta[]> {
  if (juzIndexCache) return juzIndexCache;
  const data = await import('@/data/juz-index.json');
  juzIndexCache = data.default as JuzMeta[];
  return juzIndexCache;
}

/** Get juz segments for a surah (which juz ranges contain this surah's ayahs) */
export async function getJuzSegmentsForSurah(surahId: number): Promise<Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }>> {
  const juzIndex = await getJuzIndex();
  const segments: Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }> = [];
  for (const juz of juzIndex) {
    for (const mapping of juz.verseMappings) {
      if (mapping.surahId === surahId) {
        segments.push({ juzNumber: juz.juzNumber, ayahStart: mapping.ayahStart, ayahEnd: mapping.ayahEnd });
      }
    }
  }
  return segments.sort((a, b) => a.ayahStart - b.ayahStart);
}

/**
 * The tajweed text source writes the dagger alif as U+0672 (alef with wavy hamza
 * above) where the Uthmani text has U+0670 (superscript alef) — e.g. صِرَٲطَ vs
 * صِرَٰطَ, ~1,560 times across the Quran. The Arabic font has no U+0672 glyph, so
 * it rendered as a broken box in the default script.
 *
 * Idghaam without ghunnah is marked over the silent noon AND the next word's first
 * letter (مِن رَّبِّهِمْ); only the noon is silent, so the mark is trimmed to it.
 */
export function normalizeTajweedText(html: string): string {
  return html
    .replace(/ٲ/g, 'ٰ')
    .replace(/<tajweed class=idgham_wo_ghunnah>([^< ]*) ([^<]*)<\/tajweed>/g, '<tajweed class=idgham_wo_ghunnah>$1</tajweed> $2');
}

export async function getSurah(id: number): Promise<Surah> {
  if (surahCache.has(id)) return surahCache.get(id)!;

  try {
    // Dynamic import using template — works for any surah we have data for
    const raw = await import(`@/data/surah-${id}.json`);
    const data = (raw.default ?? raw) as Surah;
    const surah: Surah = {
      ...data,
      ayahs: data.ayahs.map((a) =>
        a.textUthmaniTajweed ? { ...a, textUthmaniTajweed: normalizeTajweedText(a.textUthmaniTajweed) } : a,
      ),
    };
    surahCache.set(id, surah);
    return surah;
  } catch {
    throw new Error(`Surah ${id} not available`);
  }
}

export async function getAyah(surahId: number, ayahNumber: number): Promise<Ayah> {
  const surah = await getSurah(surahId);
  const ayah = surah.ayahs.find(a => a.number === ayahNumber);
  if (!ayah) throw new Error(`Ayah ${surahId}:${ayahNumber} not found`);
  return ayah;
}

/** Get the ayahs for a specific lesson within a surah */
export async function getLessonAyahs(surahId: number, lessonNumber: number): Promise<Ayah[]> {
  const surah = await getSurah(surahId);
  const juzSegments = await getJuzSegmentsForSurah(surahId);
  const lessons = generateLessonsWithJuzBoundaries(surahId, surah.versesCount, juzSegments);
  const lesson = lessons.find(l => l.lessonNumber === lessonNumber);
  if (!lesson) throw new Error(`Lesson ${lessonNumber} not found for surah ${surahId}`);
  return surah.ayahs.filter(a => a.number >= lesson.ayahStart && a.number <= lesson.ayahEnd);
}

/** Get lesson definitions for a surah (juz-aware) */
export async function getSurahLessons(surahId: number): Promise<LessonDef[]> {
  const surah = await getSurah(surahId);
  const juzSegments = await getJuzSegmentsForSurah(surahId);
  return generateLessonsWithJuzBoundaries(surahId, surah.versesCount, juzSegments);
}

export function getAudioUrl(surahId: number, ayahNumber: number, reciter = 'Alafasy_128kbps'): string {
  const s = surahId.toString().padStart(3, '0');
  const a = ayahNumber.toString().padStart(3, '0');
  return `https://everyayah.com/data/${reciter}/${s}${a}.mp3`;
}
