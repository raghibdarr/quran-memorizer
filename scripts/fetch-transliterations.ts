/**
 * Scrapes recitation-accurate (waqf-style) transliterations from quran411.com
 * and merges them into existing surah JSON files.
 *
 * Run: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx scripts/fetch-transliterations.ts
 */

const SURAH_SLUGS: Record<number, string> = {
  1: 'surah-fatiha',
  103: 'surah-asr',
  108: 'surah-kauthar',
  110: 'surah-nasr',
  111: 'surah-masad',
  112: 'surah-ikhlas',
  113: 'surah-falaq',
  114: 'surah-nas',
};

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function stripHtml(html: string): string {
  return html
    .replace(/<span[^>]*>.*?<\/span>/gi, '')
    .replace(/<strong[^>]*>.*?<\/strong>/gi, '')
    .replace(/<em[^>]*>.*?<\/em>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\(section \d+\)/gi, '')       // ruku markers
    .replace(/\(End Juz \d+\)/gi, '')       // juz markers
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTransliterations(surahId: number, slug: string): Promise<string[]> {
  console.log(`Fetching transliterations for surah ${surahId} (${slug})...`);

  const url = `https://quran411.com/${slug}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();

  // Find the transliteration tab div, then extract ONLY its <ol>
  const tabStart = html.indexOf('id="transliteration"');
  if (tabStart === -1) throw new Error(`Could not find transliteration tab for surah ${surahId}`);

  // Find the next </div> that closes the tab (look for the next tab div as boundary)
  const nextTabMarkers = ['id="translation"', 'id="arabic"'];
  let tabEnd = html.length;
  for (const marker of nextTabMarkers) {
    const idx = html.indexOf(marker, tabStart);
    if (idx > 0 && idx < tabEnd) tabEnd = idx;
  }

  const tabContent = html.substring(tabStart, tabEnd);

  // Extract the first <ol>...</ol> within the transliteration tab
  const olStart = tabContent.indexOf('<ol');
  const olEnd = tabContent.indexOf('</ol>');
  if (olStart === -1 || olEnd === -1) {
    throw new Error(`Could not find <ol> in transliteration tab for surah ${surahId}`);
  }

  const olContent = tabContent.substring(olStart, olEnd + 5);

  // Extract all <li> items
  const liRegex = /<li>([\s\S]*?)<\/li>/gi;
  const verses: string[] = [];
  let match;

  while ((match = liRegex.exec(olContent)) !== null) {
    const clean = stripHtml(match[1]);
    if (clean) verses.push(clean);
  }

  if (verses.length === 0) {
    throw new Error(`No verses found for surah ${surahId}`);
  }

  console.log(`  -> Found ${verses.length} verses`);
  return verses;
}

async function main() {
  const fs = await import('fs/promises');
  const path = await import('path');

  const dataDir = path.join(process.cwd(), 'src', 'data');

  for (const [idStr, slug] of Object.entries(SURAH_SLUGS)) {
    const surahId = parseInt(idStr, 10);

    try {
      const transliterations = await fetchTransliterations(surahId, slug);

      // Read existing surah JSON
      const filePath = path.join(dataDir, `surah-${surahId}.json`);
      const rawJson = await fs.readFile(filePath, 'utf-8');
      const surah = JSON.parse(rawJson);

      if (transliterations.length !== surah.ayahs.length) {
        console.warn(
          `  !! Ayah count mismatch for surah ${surahId}: ` +
          `got ${transliterations.length} transliterations but have ${surah.ayahs.length} ayahs`
        );
      }

      // Merge transliterations at the ayah level
      for (let i = 0; i < surah.ayahs.length; i++) {
        if (i < transliterations.length) {
          surah.ayahs[i].transliteration = transliterations[i];
        }
      }

      await fs.writeFile(filePath, JSON.stringify(surah, null, 2), 'utf-8');
      console.log(`  -> Updated ${filePath}`);

      await delay(500);
    } catch (err) {
      console.error(`  !! Error for surah ${surahId}:`, err);
    }
  }

  console.log('\nDone!');
}

main();
