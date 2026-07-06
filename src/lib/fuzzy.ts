// Fuzzy surah search: tolerant of transliteration variants ("yaseen" → Ya-Sin,
// "zariyat" → Adh-Dhariyat), missing articles ("fatiha" → Al-Fatihah), and small
// typos — while still ranking exact/prefix matches first.

// Spelling normalization: strip separators, then collapse common transliteration
// variants to one canonical form. Order matters (separators first).
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/[''`‘’ʿʾ-]/g, ''],
  [/\s+/g, ''],
  [/ee/g, 'i'],
  [/oo/g, 'u'],
  [/aa/g, 'a'],
  [/dh/g, 'z'],
  [/ay/g, 'ai'],
];

export function normalizeName(s: string): string {
  let out = s.toLowerCase();
  for (const [re, rep] of REPLACEMENTS) out = out.replace(re, rep);
  return out;
}

/** Drop a leading Arabic article from a normalized name: "al..." or the
 *  assimilated form "a" + doubled sound ("annas" → "nas", "ashshams" → "shams"). */
function stripArticle(s: string): string {
  if (/^al./.test(s)) return s.slice(2);
  const m = s.match(/^a(sh|[a-z])\1/);
  if (m) return s.slice(1 + m[1].length);
  return s;
}

/** Damerau (OSA) edit distance — adjacent swaps count as ONE edit, since
 *  transpositions are the most common real typo. Bails out early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] | null = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        curr[j] = Math.min(curr[j], prev2[j - 2] + 1);
      }
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = curr;
  }
  return prev[b.length];
}

function isSubsequence(q: string, t: string): boolean {
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

export interface FuzzySurahTarget {
  id: number;
  name: string;        // nameSimple, e.g. "Al-Fatihah"
  translation: string; // nameTranslation, e.g. "The Opener"
  arabic?: string;     // nameArabic
}

/** Relevance score for a surah against a search query; 0 = no match. */
export function fuzzySurahScore(query: string, target: FuzzySurahTarget): number {
  const rawQ = query.trim();
  if (!rawQ) return 0;
  if (/^\d+$/.test(rawQ)) return target.id === Number(rawQ) ? 100 : 0;
  if (target.arabic && target.arabic.includes(rawQ)) return 95;

  const q = normalizeName(rawQ);
  if (!q) return 0;
  const name = normalizeName(target.name);
  const core = stripArticle(name);
  const translation = normalizeName(target.translation);

  if (name === q || core === q) return 100;
  if (name.startsWith(q) || core.startsWith(q)) return 92;
  if (name.includes(q)) return 80;
  if (translation === q) return 78;
  if (translation.includes(q)) return 70;

  if (q.length >= 3) {
    const budget = q.length <= 4 ? 1 : 2;
    const d = Math.min(editDistance(q, core, budget), editDistance(q, name, budget));
    if (d <= budget) return 60 - d * 5;
    if (q.length >= 4 && isSubsequence(q, name)) return 40;
    if (editDistance(q, translation, budget) <= budget) return 35;
  }
  return 0;
}
