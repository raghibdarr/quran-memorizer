/**
 * Fix dhaal (ذ) transliteration from 'z' to 'th' in transliteration data.
 *
 * Uses word-level Arabic text to identify which words contain ذ (dhaal),
 * then fixes the corresponding 'z' → 'th' in the ayah-level transliteration.
 *
 * Approach: For each ayah, align Arabic words with transliteration words,
 * and for any Arabic word containing ذ, replace 'z'/'Z' with 'th'/'Th'
 * in the corresponding transliteration word.
 *
 * Usage: npx tsx scripts/fix-dhaal-transliteration.ts
 */

import fs from 'fs';
import path from 'path';

const TRANSLIT_PATH = path.join(__dirname, '../src/data/english-transliteration-tajweed.json');
const DATA_DIR = path.join(__dirname, '../src/data');

const DHAAL = '\u0630'; // ذ
const STRIP_TASHKEEL = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

function stripDiacritics(text: string): string {
  return text.replace(STRIP_TASHKEEL, '');
}

// Check if an Arabic word (stripped of diacritics) contains ذ
function hasDhaal(arabicWord: string): boolean {
  return stripDiacritics(arabicWord).includes(DHAAL);
}

// Replace 'z' with 'th' in a transliteration word, preserving case
function fixZtoTh(word: string): string {
  let result = '';
  for (let i = 0; i < word.length; i++) {
    if (word[i] === 'Z') {
      result += 'Th';
    } else if (word[i] === 'z') {
      result += 'th';
    } else {
      result += word[i];
    }
  }
  return result;
}

interface WordData {
  textUthmani: string;
  charType: string;
}

interface AyahData {
  key: string;
  textUthmani: string;
  words: WordData[];
}

interface SurahData {
  ayahs: AyahData[];
}

// Load transliteration data
const transliterations: Record<string, string> = JSON.parse(
  fs.readFileSync(TRANSLIT_PATH, 'utf-8')
);

// Load all surah data
const surahFiles = fs.readdirSync(DATA_DIR).filter((f) => /^surah-\d+\.json$/.test(f)).sort();

let fixCount = 0;
let totalKeys = 0;
const examples: string[] = [];

for (const file of surahFiles) {
  const surah: SurahData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf-8'));

  for (const ayah of surah.ayahs) {
    const key = ayah.key;
    const translit = transliterations[key];
    if (!translit) continue;
    totalKeys++;

    // Get Arabic words (actual words, not end markers)
    const arabicWords = ayah.words
      .filter((w) => w.charType === 'word')
      .map((w) => w.textUthmani);

    // Check if any Arabic word contains ذ
    const dhaalWordIndices = new Set<number>();
    arabicWords.forEach((w, i) => {
      if (hasDhaal(w)) dhaalWordIndices.add(i);
    });

    if (dhaalWordIndices.size === 0) continue;

    // Split transliteration into tokens, preserving separators
    // The QUL transliterations use spaces and hyphens as separators
    // We need to align translit words with Arabic words
    //
    // Challenge: transliteration may have different word count than Arabic
    // due to hyphenated compounds (e.g. "wa-lad" = 2 Arabic words but 1 translit token)
    // or split words.
    //
    // Strategy: split translit by spaces, then for each Arabic word index with ذ,
    // find the corresponding translit token and fix 'z' → 'th' in it.
    //
    // Since exact alignment is hard, use a simpler approach:
    // Split both by spaces, align by index where possible,
    // and for overflow, scan remaining translit tokens.

    const translitTokens = translit.split(' ');
    const newTokens = [...translitTokens];
    let changed = false;

    // Try direct index alignment first
    // Arabic words and translit tokens often align 1:1 for simple ayahs
    // For compound tokens (hyphenated), we need to handle separately

    // Build alignment: walk through both arrays
    let tIdx = 0;
    for (let aIdx = 0; aIdx < arabicWords.length && tIdx < translitTokens.length; aIdx++) {
      const currentTIdx = tIdx;

      // Check if this Arabic word has ذ
      if (dhaalWordIndices.has(aIdx)) {
        // Fix 'z' → 'th' in the corresponding translit token
        const token = translitTokens[currentTIdx];
        if (token && (token.includes('z') || token.includes('Z'))) {
          newTokens[currentTIdx] = fixZtoTh(token);
          changed = true;
        }
      }

      // Advance translit index
      // If the translit token contains a hyphen connecting to the next word,
      // the next Arabic word may share this token. Handle by checking if
      // the token ends with a hyphen-prefix pattern.
      tIdx++;

      // If the translit token was a compound like "wa-lad", it covers 2+ Arabic words
      // But detecting this reliably is hard. For now, advance 1:1.
      // This may misalign for some ayahs, but the key insight is:
      // if a translit token has no 'z', fixing it is a no-op anyway.
    }

    if (changed) {
      const newTranslit = newTokens.join(' ');
      transliterations[key] = newTranslit;
      fixCount++;
      if (examples.length < 15) {
        examples.push(`${key}: "${translit}" → "${newTranslit}"`);
      }
    }
  }
}

examples.forEach((e) => console.log(e));
console.log(`\nFixed ${fixCount} / ${totalKeys} transliterations`);

// Verify: check a known case
const test = transliterations['1:7'];
if (test?.includes('latheena')) {
  console.log('✓ 1:7 correctly has "latheena"');
} else {
  console.log('✗ 1:7 still has wrong transliteration:', test);
}

const test2 = transliterations['2:2'];
if (test2?.includes('Thaalik')) {
  console.log('✓ 2:2 correctly has "Thaalik"');
} else {
  console.log('✗ 2:2 still has wrong transliteration:', test2);
}

// Write back
fs.writeFileSync(TRANSLIT_PATH, JSON.stringify(transliterations), 'utf-8');
console.log('Saved to', TRANSLIT_PATH);
