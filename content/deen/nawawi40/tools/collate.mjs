// Collation for the Forty (spec 5.4 stages C and D): re-reads every witness an item
// lists, finds the item's span in it, and reports word differences, the skeleton
// hash and, for vocalised witnesses, the words whose vowelling differs from ours.
//
//   node content/deen/nawawi40/tools/collate.mjs [ids…] [--write] [--vowels]
//
// Witness pages are fetched one at a time with a pause and cached outside the repo
// (NAWAWI_CACHE, default: the OS temp folder). Nothing fetched is committed or bundled.
//
// What the hash covers: the witness's text of the item's span (from al-Nawawi's
// opening "عن …" to the end of the narration, before his closing attribution line),
// reduced to the consonantal skeleton by scripts/build-deen.mjs, with one extra,
// declared folding: the honorific formulas are written the way we print them
// (صلى الله [تعالى] عليه [وعلى آله] وسلم → ﷺ; رضي الله تعالى عنه → رضي الله عنه).
// Prints differ in those formulas only by house style; every other difference stays
// in the hash and is listed in the item's provenance.note.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const deckDir = join(here, '..');
const root = join(deckDir, '..', '..', '..');
const { arabicSkeleton, sha256 } = await import(pathToFileURL(join(root, 'scripts', 'build-deen.mjs')).href);
const CACHE = process.env.NAWAWI_CACHE ?? join(tmpdir(), 'takrar-nawawi40-witnesses');
// Optional per-item end words where a span's closing words recur early: { "07": { "end": "…" } }
const HINTS = existsSync(join(here, 'end-hints.json')) ? JSON.parse(readFileSync(join(here, 'end-hints.json'), 'utf8')) : {};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the declared honorific folding ----------

/** Formula word sequences (in skeleton form) and what they fold to */
const FORMULAS = [
  { words: ['صلي', 'الله', 'تعالي', 'عليه', 'وعلي', 'اله', 'وسلم'], to: ['ﷺ'] },
  { words: ['صلي', 'الله', 'عليه', 'وعلي', 'اله', 'وسلم'], to: ['ﷺ'] },
  { words: ['صلي', 'الله', 'تعالي', 'عليه', 'وسلم'], to: ['ﷺ'] },
  { words: ['صلي', 'الله', 'عليه', 'و', 'سلم'], to: ['ﷺ'] },
  { words: ['صلي', 'الله', 'عليه', 'وسلم'], to: ['ﷺ'] },
  ...['عنه', 'عنها', 'عنهما', 'عنهم'].map((p) => ({ words: ['رضي', 'الله', 'تعالي', p], to: ['رضي', 'الله', p] })),
];

/**
 * Skeleton tokens of a text with the formulas folded. Each token remembers the
 * raw word(s) it came from, so a span found in skeleton space can be read back
 * with its vowels.
 */
export function collationTokens(text) {
  const raw = text.replace(/\s+/g, ' ').trim().split(' ');
  const toks = [];
  raw.forEach((w, i) => { for (const p of arabicSkeleton(w).split(' ').filter(Boolean)) toks.push({ t: p, from: i, to: i }); });
  const out = [];
  for (let k = 0; k < toks.length;) {
    const f = FORMULAS.find((F) => F.words.every((w, d) => toks[k + d]?.t === w));
    if (f) {
      const from = toks[k].from, to = toks[k + f.words.length - 1].to;
      for (const t of f.to) out.push({ t, from, to });
      k += f.words.length;
    } else { out.push(toks[k]); k++; }
  }
  return { raw, toks: out };
}

export const collationSkeleton = (text) => collationTokens(text).toks.map((x) => x.t).join(' ');

// ---------- witnesses ----------

async function cached(key, url) {
  mkdirSync(CACHE, { recursive: true });
  const f = join(CACHE, key);
  if (existsSync(f)) return readFileSync(f, 'utf8');
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (collation; one page at a time)' } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const t = await r.text();
  writeFileSync(f, t);
  await sleep(800);
  return t;
}

/** The body text of one shamela.ws page, footnotes and footnote markers dropped */
export function shamelaBody(html) {
  const i = html.indexOf('class="nass margin-top-10"');
  if (i < 0) return '';
  const end = html.indexOf('<div id="appended_pages">', i);
  let body = html.slice(i, end < 0 ? undefined : end)
    .replace(/<a [^>]*class="btn_tag[^>]*>.*?<\/a>/g, '')
    .replace(/<hr[^>]*>[\s\S]*$/, '')
    .replace(/<\/p>/g, '\n')
    .replace(/<[^>]*>/g, '');
  body = body.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/^[^>]*>/, '');
  return body.replace(/\(\s*[٠-٩0-9]+\s*\)/g, ' ');
}

/** The text a witness entry points at (its page and the two after it) */
async function witnessText(w, n) {
  const m = /shamela\.ws\/book\/(\d+)\/(\d+)/.exec(w.ref);
  if (m) {
    const [, book, page] = m;
    const parts = [];
    for (let p = +page; p < +page + 3; p++) parts.push(shamelaBody(await cached(`shamela-${book}-${p}.html`, `https://shamela.ws/book/${book}/${p}`)));
    return parts.join('\n');
  }
  if (w.name === 'hadith-api') {
    const edition = /(ara-[a-z]+)/.exec(w.ref)?.[1] ?? 'ara-nawawi';
    const json = JSON.parse(await cached(`${edition}.json`, `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${edition}.json`));
    const num = Number(/hadith (\d+)/.exec(w.ref)?.[1] ?? n);
    return json.hadiths.find((h) => h.hadithnumber === num)?.text ?? '';
  }
  throw new Error(`no reader for witness ${w.name}: ${w.ref}`);
}

// ---------- alignment ----------

/** Word-level LCS alignment: [index in a | null, index in b | null][] */
export function align(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { out.push([i, j]); i++; j++; }
    else if (j < m && (i === n || dp[i][j + 1] >= dp[i + 1][j])) { out.push([null, j]); j++; }
    else { out.push([i, null]); i++; }
  }
  return out;
}

/** Runs of differences between two token lists */
export function changes(a, b) {
  const out = [];
  let cur = null;
  for (const [i, j] of align(a, b)) {
    if (i !== null && j !== null) { if (cur) { out.push(cur); cur = null; } continue; }
    cur ??= { ours: [], theirs: [] };
    if (i !== null) cur.ours.push(a[i]); else cur.theirs.push(b[j]);
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Finds our span inside a witness's text: from where our first words occur to the
 * last place our final words occur (both searched with 3, then 2, then 1 words).
 * Returns the span's collation skeleton and its raw words (for vowels), or null.
 */
export function findSpan(ours, theirsText, { endHint } = {}) {
  const o = collationSkeleton(ours).split(' ');
  const { raw, toks } = collationTokens(theirsText);
  const t = toks.map((x) => x.t);
  const occurs = (needle, i) => needle.every((w, d) => t[i + d] === w);
  let s = -1;
  for (const len of [3, 2, 1]) { s = t.findIndex((_, i) => occurs(o.slice(0, len), i)); if (s >= 0) break; }
  if (s < 0) return null;
  // The end: the first occurrence of our closing words after the start (a later
  // occurrence belongs to the commentary), unless the item gives an explicit hint
  const tail = endHint ? collationSkeleton(endHint).split(' ') : null;
  let e = -1;
  for (const len of tail ? [tail.length] : [3, 2]) {
    const needle = tail ?? o.slice(-len);
    for (let i = s; i <= t.length - needle.length; i++) if (occurs(needle, i)) { e = i + needle.length; break; }
    if (e >= 0) break;
  }
  if (e < 0 || e - s > o.length * 1.5 + 10) return null;
  return { skeleton: t.slice(s, e).join(' '), raw: raw.slice(toks[s].from, toks[e - 1].to + 1) };
}

// ---------- vowels ----------

const IS_MARK = /[ً-ْٰ]/;
const SEAT = { 'آ': 'ا', 'أ': 'ا', 'إ': 'ا', 'ٱ': 'ا', 'ؤ': 'و', 'ئ': 'ي', 'ى': 'ي' };

/** A word as letters, each with the set of marks on it (hamza seats folded) */
function lettersWithMarks(w) {
  const out = [];
  for (const ch of w.normalize('NFC')) {
    if (IS_MARK.test(ch)) { if (out.length) out[out.length - 1].m.push(ch); continue; }
    if (!/[ء-ي]/.test(ch)) continue;
    out.push({ l: SEAT[ch] ?? ch, m: [] });
  }
  return out;
}

/**
 * Where both texts vowel the same letter and the vowels differ. A letter one side
 * leaves bare, or marks with a subset of the other's marks, is not a difference (prints vowel sparingly), nor is a hamza seat
 * written differently, nor a sukun one side leaves out; the word-final letter is
 * compared too, because case endings carry meaning.
 */
export function vowelConflicts(a, b) {
  const A = lettersWithMarks(a), B = lettersWithMarks(b);
  if (A.length !== B.length) return false;
  return A.some((x, i) => {
    const ma = x.m.filter((c) => c !== 'ْ'), mb = B[i].m.filter((c) => c !== 'ْ');
    // One side marking less (a bare letter, shadda without its vowel) is not a conflict
    return !ma.every((c) => mb.includes(c)) && !mb.every((c) => ma.includes(c));
  });
}

/** Words with the same skeleton whose vowels conflict (vocalised witnesses only) */
export function vowelDiffs(ours, theirsRaw) {
  const a = ours.replace(/\s+/g, ' ').trim().split(' ').filter((w) => arabicSkeleton(w));
  const b = theirsRaw.filter((w) => arabicSkeleton(w));
  const out = [];
  for (const [i, j] of align(a.map(arabicSkeleton), b.map(arabicSkeleton))) {
    if (i === null || j === null) continue;
    if (vowelConflicts(a[i], b[j])) out.push(`${a[i]} ≠ ${b[j]}`);
  }
  return out;
}

// ---------- main ----------

async function main(argv) {
  const write = argv.includes('--write');
  const vowels = argv.includes('--vowels');
  const ids = argv.filter((a) => !a.startsWith('--'));
  const dir = join(deckDir, 'items');
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).filter((f) => !ids.length || ids.includes(f.replace(/\.json$/, '')));
  let bad = 0;
  for (const f of files) {
    const path = join(dir, f);
    const item = JSON.parse(readFileSync(path, 'utf8'));
    const ours = collationSkeleton(item.arabic);
    const want = sha256(arabicSkeleton(item.arabic));
    console.log(`\n# ${item.id} ${item.title}`);
    if (ours !== arabicSkeleton(item.arabic)) { console.log('  ! our text holds a long honorific formula: write ﷺ and رضي الله عنه'); bad++; }
    for (const w of item.provenance?.witnesses ?? []) {
      let text;
      try { text = await witnessText(w, Number(item.id)); } catch (e) { console.log(`  ${w.name}: UNREACHABLE (${e.message})`); bad++; continue; }
      const span = findSpan(item.arabic, text, { endHint: HINTS[item.id]?.[w.name] ?? HINTS[item.id]?.end });
      if (!span) { console.log(`  ${w.name}: span NOT FOUND`); bad++; continue; }
      const h = sha256(span.skeleton);
      const ch = changes(ours.split(' '), span.skeleton.split(' '));
      console.log(`  ${w.name}: ${h === want ? 'identical' : `${ch.length} difference(s)`} ${h.slice(0, 12)}`);
      for (const c of ch) console.log(`     ours «${c.ours.join(' ')}» · witness «${c.theirs.join(' ')}»`);
      if (vowels && /[ً-ْ]/.test(span.raw.join(' '))) {
        const v = vowelDiffs(item.arabic, span.raw);
        console.log(`     vowels: ${v.length ? `${v.length} word(s) differ` : 'agree'}`);
        for (const d of v) console.log(`       ${d}`);
      }
      if (w.skeletonSha256 !== h) {
        if (write) w.skeletonSha256 = h;
        else { console.log(`     stored hash ${String(w.skeletonSha256).slice(0, 12)} ≠ computed`); bad++; }
      }
    }
    if (write) writeFileSync(path, JSON.stringify(item, null, 2) + '\n');
  }
  return bad ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(await main(process.argv.slice(2)));
}
