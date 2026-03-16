/**
 * Fetches Quran data from quran.com API v4 for MVP surahs
 * and saves as static JSON files.
 *
 * Run: npx tsx scripts/fetch-quran-data.ts
 */

const MVP_SURAHS = [1, 103, 108, 110, 111, 112, 113, 114];

const API_BASE = 'https://api.quran.com/api/v4';
const AUDIO_BASE = 'https://everyayah.com/data/Alafasy_128kbps';

interface ApiWord {
  id: number;
  position: number;
  text_uthmani: string;
  char_type_name: string;
  translation?: { text: string };
  transliteration?: { text: string };
  audio?: { url: string };
}

interface ApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani: string;
  words: ApiWord[];
  translations?: Array<{ text: string }>;
}

interface ApiChapter {
  id: number;
  name_simple: string;
  name_arabic: string;
  translated_name: { name: string };
  revelation_place: string;
  verses_count: number;
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

function getAudioUrl(surahId: number, ayahNumber: number): string {
  return `${AUDIO_BASE}/${pad3(surahId)}${pad3(ayahNumber)}.mp3`;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchSurah(surahId: number) {
  console.log(`Fetching surah ${surahId}...`);

  // Fetch chapter metadata
  const chapterData = await fetchJson(`${API_BASE}/chapters/${surahId}?language=en`) as { chapter: ApiChapter };
  const chapter = chapterData.chapter;

  await delay(500);

  // Fetch verses with words and translation (Sahih International = ID 20)
  const versesData = await fetchJson(
    `${API_BASE}/verses/by_chapter/${surahId}?language=en&words=true&translation_fields=text&translations=20&word_fields=text_uthmani&per_page=50`
  ) as { verses: ApiVerse[] };

  await delay(500);

  // Fetch word transliterations separately
  const translitData = await fetchJson(
    `${API_BASE}/verses/by_chapter/${surahId}?language=en&words=true&word_fields=text_uthmani&word_translation_language=en&per_page=50`
  ) as { verses: ApiVerse[] };

  await delay(500);

  // Fetch ayah-level translations (Sahih International = resource 20)
  const translationsData = await fetchJson(
    `${API_BASE}/quran/translations/20?chapter_number=${surahId}`
  ) as { translations: Array<{ resource_id: number; text: string }> };
  // Translations come in order matching verses — no verse_key field
  const translationTexts = translationsData.translations.map(
    t => t.text.replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]*>/g, '').trim()
  );

  const ayahs = versesData.verses.map((verse, idx) => {
    const translitVerse = translitData.verses[idx];

    const words = verse.words.map((word, wIdx) => {
      const translitWord = translitVerse?.words?.[wIdx];
      return {
        position: word.position,
        textUthmani: word.text_uthmani,
        transliteration: translitWord?.transliteration?.text || word.transliteration?.text || null,
        translation: word.translation?.text || null,
        audioUrl: word.audio?.url ? `https://audio.qurancdn.com/${word.audio.url}` : null,
        charType: word.char_type_name === 'word' ? 'word' as const : 'end' as const,
      };
    });

    return {
      number: verse.verse_number,
      key: verse.verse_key,
      textUthmani: verse.text_uthmani,
      words,
      translation: translationTexts[idx] || '',
      audioUrl: getAudioUrl(surahId, verse.verse_number),
    };
  });

  return {
    id: chapter.id,
    nameSimple: chapter.name_simple,
    nameArabic: chapter.name_arabic,
    nameTranslation: chapter.translated_name.name,
    revelationPlace: chapter.revelation_place as 'makkah' | 'madinah',
    versesCount: chapter.verses_count,
    ayahs,
  };
}

async function main() {
  const fs = await import('fs/promises');
  const path = await import('path');

  const dataDir = path.join(process.cwd(), 'src', 'data');

  const index: Array<{
    id: number;
    nameSimple: string;
    nameArabic: string;
    nameTranslation: string;
    revelationPlace: string;
    versesCount: number;
  }> = [];

  for (const surahId of MVP_SURAHS) {
    try {
      const surah = await fetchSurah(surahId);

      // Write full surah data
      const filePath = path.join(dataDir, `surah-${surahId}.json`);
      await fs.writeFile(filePath, JSON.stringify(surah, null, 2), 'utf-8');
      console.log(`  -> Saved ${filePath} (${surah.ayahs.length} ayahs)`);

      // Add to index
      index.push({
        id: surah.id,
        nameSimple: surah.nameSimple,
        nameArabic: surah.nameArabic,
        nameTranslation: surah.nameTranslation,
        revelationPlace: surah.revelationPlace,
        versesCount: surah.versesCount,
      });

      await delay(500);
    } catch (err) {
      console.error(`  !! Error fetching surah ${surahId}:`, err);
    }
  }

  // Write index
  const indexPath = path.join(dataDir, 'surahs-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\nSaved index: ${indexPath}`);
  console.log('Done!');
}

main();
