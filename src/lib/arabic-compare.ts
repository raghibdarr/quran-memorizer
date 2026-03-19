/**
 * Arabic text comparison for voice recognition accuracy scoring.
 * Strips diacritics and normalizes Arabic text before comparing.
 */

// Unicode ranges for Arabic diacritics (tashkeel)
const TASHKEEL_RE = /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;

// Kashida / tatweel
const KASHIDA_RE = /\u0640/g;

/** Remove all diacritical marks from Arabic text */
export function stripTashkeel(text: string): string {
  return text.replace(TASHKEEL_RE, '');
}

/** Normalize Arabic text for comparison: strip diacritics, normalize alef variants, taa marbuta, kashida */
export function normalizeArabic(text: string): string {
  let normalized = stripTashkeel(text);
  // Remove kashida
  normalized = normalized.replace(KASHIDA_RE, '');
  // Normalize alef variants to plain alef
  normalized = normalized.replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627');
  // Normalize taa marbuta to haa
  normalized = normalized.replace(/\u0629/g, '\u0647');
  // Normalize alef maksura to yaa
  normalized = normalized.replace(/\u0649/g, '\u064A');
  // Collapse whitespace
  normalized = normalized.replace(/\s+/g, ' ').trim();
  return normalized;
}

export interface WordResult {
  word: string;
  correct: boolean;
}

export interface CompareResult {
  accuracy: number;       // 0-1
  wordResults: WordResult[];
}

/** Compare transcribed text against expected Arabic text, returning word-level accuracy */
export function compareAyahText(transcribed: string, expected: string): CompareResult {
  const transWords = normalizeArabic(transcribed).split(' ').filter(Boolean);
  const expWords = normalizeArabic(expected).split(' ').filter(Boolean);

  if (expWords.length === 0) {
    return { accuracy: transWords.length === 0 ? 1 : 0, wordResults: [] };
  }

  // Simple LCS-based diff to handle insertions/deletions
  const m = expWords.length;
  const n = transWords.length;

  // Build LCS table
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (expWords[i - 1] === transWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find matched positions
  const matchedExp = new Set<number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (expWords[i - 1] === transWords[j - 1]) {
      matchedExp.add(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  const wordResults: WordResult[] = expWords.map((word, idx) => ({
    word,
    correct: matchedExp.has(idx),
  }));

  const correctCount = matchedExp.size;
  const accuracy = correctCount / m;

  return { accuracy, wordResults };
}

/** Basic Arabic → Latin transliteration for debugging voice recognition output */
const ARABIC_TO_LATIN: Record<string, string> = {
  '\u0627': 'a',   // alef
  '\u0628': 'b',   // ba
  '\u062A': 't',   // ta
  '\u062B': 'th',  // tha
  '\u062C': 'j',   // jim
  '\u062D': 'H',   // ha (emphatic)
  '\u062E': 'kh',  // kha
  '\u062F': 'd',   // dal
  '\u0630': 'dh',  // dhal
  '\u0631': 'r',   // ra
  '\u0632': 'z',   // zayn
  '\u0633': 's',   // sin
  '\u0634': 'sh',  // shin
  '\u0635': 'S',   // sad
  '\u0636': 'D',   // dad
  '\u0637': 'T',   // ta (emphatic)
  '\u0638': 'Z',   // za (emphatic)
  '\u0639': "'",   // ayn
  '\u063A': 'gh',  // ghayn
  '\u0641': 'f',   // fa
  '\u0642': 'q',   // qaf
  '\u0643': 'k',   // kaf
  '\u0644': 'l',   // lam
  '\u0645': 'm',   // mim
  '\u0646': 'n',   // nun
  '\u0647': 'h',   // ha
  '\u0648': 'w',   // waw
  '\u064A': 'y',   // ya
  '\u0629': 'h',   // ta marbuta
  '\u0649': 'a',   // alef maksura
  '\u0622': 'aa',  // alef madda
  '\u0623': 'a',   // alef hamza above
  '\u0625': 'i',   // alef hamza below
  '\u0621': "'",   // hamza
  '\u0626': "'",   // ya hamza
  '\u0624': "'",   // waw hamza
  '\u0671': 'a',   // alef wasla
  '\u0644\u0627': 'la', // lam-alef
};

export function transliterateArabic(text: string): string {
  const stripped = stripTashkeel(text);
  let result = '';
  for (let i = 0; i < stripped.length; i++) {
    // Check two-char combos first (lam-alef)
    const twoChar = stripped[i] + (stripped[i + 1] ?? '');
    if (ARABIC_TO_LATIN[twoChar]) {
      result += ARABIC_TO_LATIN[twoChar];
      i++;
    } else if (ARABIC_TO_LATIN[stripped[i]]) {
      result += ARABIC_TO_LATIN[stripped[i]];
    } else {
      result += stripped[i]; // keep spaces, punctuation, etc.
    }
  }
  return result;
}
