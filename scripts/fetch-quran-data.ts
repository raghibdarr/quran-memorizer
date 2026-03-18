/**
 * Fetches Quran data from quran.com API v4 for MVP surahs
 * and saves as static JSON files.
 *
 * Run: npx tsx scripts/fetch-quran-data.ts
 */

// All 114 surahs
const ALL_SURAHS = Array.from({ length: 114 }, (_, i) => i + 1);

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
  audio_url?: string;
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

/** Fetch all pages of a paginated verses endpoint */
async function fetchAllVersePages(url: string): Promise<ApiVerse[]> {
  const allVerses: ApiVerse[] = [];
  let page = 1;
  while (true) {
    const sep = url.includes('?') ? '&' : '?';
    const data = await fetchJson(`${url}${sep}page=${page}&per_page=50`) as {
      verses: ApiVerse[];
      pagination: { total_pages: number; current_page: number };
    };
    allVerses.push(...data.verses);
    if (data.pagination.current_page >= data.pagination.total_pages) break;
    page++;
    await delay(300);
  }
  return allVerses;
}

async function fetchSurah(surahId: number) {
  console.log(`Fetching surah ${surahId}...`);

  // Fetch chapter metadata
  const chapterData = await fetchJson(`${API_BASE}/chapters/${surahId}?language=en`) as { chapter: ApiChapter };
  const chapter = chapterData.chapter;

  await delay(300);

  // Fetch verses with words and translation (Sahih International = ID 20)
  const versesAll = await fetchAllVersePages(
    `${API_BASE}/verses/by_chapter/${surahId}?language=en&words=true&translation_fields=text&translations=20&word_fields=text_uthmani,audio_url&fields=text_uthmani`
  );

  await delay(300);

  // Fetch word transliterations separately
  const translitAll = await fetchAllVersePages(
    `${API_BASE}/verses/by_chapter/${surahId}?language=en&words=true&word_fields=text_uthmani&word_translation_language=en`
  );

  await delay(300);

  // Fetch ayah-level translations (Sahih International = resource 20)
  const translationsData = await fetchJson(
    `${API_BASE}/quran/translations/20?chapter_number=${surahId}`
  ) as { translations: Array<{ resource_id: number; text: string }> };
  const translationTexts = translationsData.translations.map(
    t => t.text.replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]*>/g, '').trim()
  );

  await delay(300);

  // Fetch tajweed text (HTML with color-coded tajweed rules)
  const tajweedData = await fetchJson(
    `${API_BASE}/quran/verses/uthmani_tajweed?chapter_number=${surahId}`
  ) as { verses: Array<{ verse_key: string; text_uthmani_tajweed: string }> };

  await delay(300);

  // Fetch IndoPak text
  const indopakData = await fetchJson(
    `${API_BASE}/quran/verses/indopak?chapter_number=${surahId}`
  ) as { verses: Array<{ verse_key: string; text_indopak: string }> };

  // Load QUL transliteration data (covers entire Quran)
  const fs2 = await import('fs/promises');
  const path2 = await import('path');
  const qulTranslitRaw = await fs2.readFile(
    path2.join(process.cwd(), 'src', 'data', 'english-transliteration-tajweed.json'), 'utf-8'
  );
  const qulTranslit: Record<string, string> = JSON.parse(qulTranslitRaw);

  const ayahs = versesAll.map((verse, idx) => {
    const translitVerse = translitAll[idx];

    const words = verse.words.map((word, wIdx) => {
      const translitWord = translitVerse?.words?.[wIdx];
      return {
        position: word.position,
        textUthmani: word.text_uthmani,
        transliteration: translitWord?.transliteration?.text || word.transliteration?.text || null,
        translation: word.translation?.text || null,
        audioUrl: word.audio_url ? `https://audio.qurancdn.com/${word.audio_url}` : (word.audio?.url ? `https://audio.qurancdn.com/${word.audio.url}` : null),
        charType: word.char_type_name === 'word' ? 'word' as const : 'end' as const,
      };
    });

    return {
      number: verse.verse_number,
      key: verse.verse_key,
      textUthmani: verse.text_uthmani,
      textUthmaniTajweed: tajweedData.verses[idx]?.text_uthmani_tajweed || '',
      textIndopak: indopakData.verses[idx]?.text_indopak || '',
      words,
      translation: translationTexts[idx] || '',
      transliteration: qulTranslit[verse.verse_key] || '',
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

  // Check --skip-existing flag to resume partial fetches
  const skipExisting = process.argv.includes('--skip-existing');

  const index: Array<{
    id: number;
    nameSimple: string;
    nameArabic: string;
    nameTranslation: string;
    revelationPlace: string;
    versesCount: number;
  }> = [];

  for (const surahId of ALL_SURAHS) {
    const filePath = path.join(dataDir, `surah-${surahId}.json`);

    // Skip if file already exists and flag is set
    if (skipExisting) {
      try {
        await fs.access(filePath);
        // File exists — read metadata for index
        const existing = JSON.parse(await fs.readFile(filePath, 'utf-8'));
        index.push({
          id: existing.id,
          nameSimple: existing.nameSimple,
          nameArabic: existing.nameArabic,
          nameTranslation: existing.nameTranslation,
          revelationPlace: existing.revelationPlace,
          versesCount: existing.versesCount,
        });
        console.log(`Skipping surah ${surahId} (already exists)`);
        continue;
      } catch {
        // File doesn't exist, fetch it
      }
    }

    try {
      const surah = await fetchSurah(surahId);

      // Write full surah data
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

      await delay(300);
    } catch (err) {
      console.error(`  !! Error fetching surah ${surahId}:`, err);
    }
  }

  // Write index sorted by surah ID
  index.sort((a, b) => a.id - b.id);
  const indexPath = path.join(dataDir, 'surahs-index.json');
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`\nSaved index: ${indexPath} (${index.length} surahs)`);

  // Fetch juz metadata
  await fetchJuzData(dataDir);

  console.log('Done!');
}

async function fetchJuzData(dataDir: string) {
  const fs = await import('fs/promises');
  const path = await import('path');

  console.log('\nFetching juz metadata...');
  const data = await fetchJson(`${API_BASE}/juzs`) as {
    juzs: Array<{
      id: number;
      juz_number: number;
      verse_mapping: Record<string, string>;
    }>;
  };

  // Group by juz number (API returns 2 entries per juz — one per hizb)
  const juzMap = new Map<number, Array<{ surahId: number; ayahStart: number; ayahEnd: number }>>();

  for (const juz of data.juzs) {
    if (!juzMap.has(juz.juz_number)) {
      juzMap.set(juz.juz_number, []);
    }
    const mappings = juzMap.get(juz.juz_number)!;

    for (const [surahId, range] of Object.entries(juz.verse_mapping)) {
      const [start, end] = range.split('-').map(Number);
      mappings.push({
        surahId: Number(surahId),
        ayahStart: start,
        ayahEnd: end,
      });
    }
  }

  // Merge overlapping/adjacent segments for the same surah within a juz
  const juzIndex: Array<{ juzNumber: number; verseMappings: Array<{ surahId: number; ayahStart: number; ayahEnd: number }> }> = [];

  for (const [juzNumber, rawMappings] of juzMap) {
    // Group by surahId and merge ranges
    const bySurah = new Map<number, { ayahStart: number; ayahEnd: number }>();
    for (const m of rawMappings) {
      const existing = bySurah.get(m.surahId);
      if (existing) {
        existing.ayahStart = Math.min(existing.ayahStart, m.ayahStart);
        existing.ayahEnd = Math.max(existing.ayahEnd, m.ayahEnd);
      } else {
        bySurah.set(m.surahId, { ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
      }
    }

    const verseMappings = Array.from(bySurah.entries())
      .map(([surahId, range]) => ({ surahId, ...range }))
      .sort((a, b) => a.surahId - b.surahId || a.ayahStart - b.ayahStart);

    juzIndex.push({ juzNumber, verseMappings });
  }

  juzIndex.sort((a, b) => a.juzNumber - b.juzNumber);

  const juzPath = path.join(dataDir, 'juz-index.json');
  await fs.writeFile(juzPath, JSON.stringify(juzIndex, null, 2), 'utf-8');
  console.log(`Saved juz index: ${juzPath} (${juzIndex.length} juz)`);
}

main();
