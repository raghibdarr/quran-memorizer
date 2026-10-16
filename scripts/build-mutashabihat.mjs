// Builds src/data/mutashabihat.json: pairs of ayahs that are nearly the same but differ
// by a few words (the classic hifz confusion), computed from our own Uthmani text.
//   { "2:35": [{ "k": "7:19", "d": [5, 6], "t": [5, 6, 7] }], ... }
// d = word indexes (0-based over real words) in this ayah that differ; t = in the twin.
// Verbatim repeats (55:13's refrain) are left out: nothing to confuse.
// Run: node scripts/build-mutashabihat.mjs
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIN_WORDS = 4;      // shorter ayahs collide by chance
// 0.6 catches the classic pairs (2:58 / 7:161, the Iblis ayahs 2:34 / 17:61 / 20:116)
const MIN_SIMILARITY = 0.6;
/** Differing words allowed, either side: a few, or up to 40% of a long ayah */
const maxDiff = (len) => Math.max(3, Math.round(len * 0.4));
const MAX_TWINS = 3;

/** Letters only: drop marks, tatweel and small letters, fold alif/ya/ha variants */
const norm = (w) =>
  w.replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');

const ayahs = [];
for (let s = 1; s <= 114; s++) {
  const surah = JSON.parse(readFileSync(join(root, 'src', 'data', `surah-${s}.json`), 'utf8'));
  for (const a of surah.ayahs) {
    const words = a.words.filter((w) => w.charType === 'word').map((w) => norm(w.textUthmani));
    ayahs.push({ key: `${s}:${a.number}`, words });
  }
}

// Candidate pairs share word trigrams
const index = new Map();
ayahs.forEach((a, i) => {
  if (a.words.length < MIN_WORDS) return;
  const seen = new Set();
  for (let j = 0; j + 2 < a.words.length; j++) {
    const g = a.words.slice(j, j + 3).join(' ');
    if (seen.has(g)) continue;
    seen.add(g);
    (index.get(g) ?? index.set(g, []).get(g)).push(i);
  }
});

/** Word-level LCS: which indexes of a and b are shared, in order */
function lcs(a, b) {
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ka = new Set(), kb = new Set();
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { ka.add(i++); kb.add(j++); }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return { n: dp[0][0], ka, kb };
}

const twins = new Map();
const add = (i, entry) => (twins.get(i) ?? twins.set(i, []).get(i)).push(entry);
const done = new Set();
let pairs = 0;
for (const list of index.values()) {
  if (list.length > 60) continue; // ubiquitous phrases (e.g. "إن الله") say nothing
  for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const i = list[x], j = list[y];
    const id = i < j ? `${i}-${j}` : `${j}-${i}`;
    if (done.has(id)) continue;
    done.add(id);
    const a = ayahs[i].words, b = ayahs[j].words;
    if (Math.min(a.length, b.length) / Math.max(a.length, b.length) < MIN_SIMILARITY) continue;
    const { n, ka, kb } = lcs(a, b);
    const sim = (2 * n) / (a.length + b.length);
    const da = a.map((_, k) => k).filter((k) => !ka.has(k));
    const db = b.map((_, k) => k).filter((k) => !kb.has(k));
    if (sim < MIN_SIMILARITY || (da.length === 0 && db.length === 0)) continue;
    if (da.length > maxDiff(a.length) || db.length > maxDiff(b.length)) continue;
    add(i, { k: ayahs[j].key, d: da, t: db, s: sim });
    add(j, { k: ayahs[i].key, d: db, t: da, s: sim });
    pairs++;
  }
}

const out = {};
for (const [i, list] of [...twins].sort((x, y) => x[0] - y[0])) {
  out[ayahs[i].key] = list.sort((p, q) => q.s - p.s).slice(0, MAX_TWINS).map(({ k, d, t }) => ({ k, d, t }));
}
writeFileSync(join(root, 'src', 'data', 'mutashabihat.json'), JSON.stringify(out));
console.log(`${pairs} pairs; ${Object.keys(out).length} ayahs have a twin`);
for (const k of ['2:35', '2:58', '7:161', '2:48', '6:151', '1:1', '112:1']) console.log(k, JSON.stringify(out[k] ?? null));
