// A stricter checker for the Names deck than build-deen's guardrail 6 (which only asks
// that a quran-name Name's skeleton occurs somewhere in the cited ayah). Run it after
// editing an item:
//
//   node content/deen/names99/check-names.mjs            check; exit 1 on a problem
//   node content/deen/names99/check-names.mjs --print    also print every cited ayah
//
// Checks: 99 items in list order (001 = Allah … 099 = al-Sabur); meaning at most 12
// words and explanation at most 40; a quran-name Name occurs as whole words in every
// ayah it cites (a leading wa-, fa-, bi-, la- or the article may differ, as the Quran
// says "wa huwa al-…" or "la-…"); a quran-derived Name's `form` is copied exactly from
// its first cited ayah; list-only and hadith Names cite no ayah as their evidence.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arabicSkeleton } from '../../../scripts/build-deen.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');

const words = (s) => (s.match(/\S+/g) ?? []).length;
/** Skeleton with alif and hamza dropped, as build-deen's looseSkeleton, per word */
const bare = (w) => arabicSkeleton(w).replace(/[اء]/g, '');
/** The article (its alif already dropped) off */
const noArticle = (b) => b.replace(/^ل/, '');
/** A Name word reduced for comparing */
const stem = (w) => noArticle(bare(w));
/**
 * Particles whose bare skeleton equals a Name's (على "upon" reads like العلي once the
 * vowels and the article are gone). They are never a Name.
 */
const PARTICLES = new Set(['علي', 'وعلي', 'فعلي']);
/** Every reading of a Quran word with a leading wa-, fa-, bi- or la- and the article taken off or kept */
function readings(w) {
  const b = bare(w);
  if (PARTICLES.has(b)) return new Set();
  const out = new Set([b, noArticle(b)]);
  const off = b.replace(/^[وفبل]/, '');
  if (off !== b) [off, noArticle(off)].forEach((x) => out.add(x));
  return out;
}

const cache = new Map();
function ayahText(s, a) {
  if (!cache.has(s)) cache.set(s, JSON.parse(readFileSync(join(ROOT, 'src', 'data', `surah-${s}.json`), 'utf8')));
  return cache.get(s).ayahs.find((x) => x.number === a)?.textUthmani ?? null;
}
const clean = (t) => t.normalize('NFC').replace(/ـ/g, '');

/** Does the run of Name words occur, word for word, in the ayah? */
export function nameOccurs(nameArabic, ayah) {
  const name = nameArabic.split(/\s+/).map(stem);
  const ws = ayah.split(/\s+/).filter((w) => bare(w)).map(readings);
  for (let i = 0; i + name.length <= ws.length; i++) {
    if (name.every((n, j) => ws[i + j].has(n))) return true;
  }
  return false;
}

export function checkNames(items) {
  const problems = [];
  const P = (id, msg) => problems.push(`${id}: ${msg}`);
  if (items.length !== 99) problems.push(`expected 99 items, found ${items.length}`);
  items.forEach((it, i) => {
    const id = it.id;
    if (it.order !== i + 1 || id !== String(i + 1).padStart(3, '0')) P(id, `out of order (order ${it.order})`);
    if (words(it.meaning) > 12) P(id, `meaning is ${words(it.meaning)} words (at most 12)`);
    if (words(it.explanation) > 40) P(id, `explanation is ${words(it.explanation)} words (at most 40)`);
    const ev = it.evidence;
    const refs = ev.quran ?? [];
    if (ev.kind === 'quran-name') {
      for (const r of refs) {
        const texts = [];
        for (let a = r.ayah; a <= (r.ayahEnd ?? r.ayah); a++) texts.push(ayahText(r.surahId, a) ?? '');
        if (!nameOccurs(ev.form ?? it.arabic, texts.join(' '))) P(id, `${r.surahId}:${r.ayah} does not contain the Name as a word`);
      }
    } else if (ev.kind === 'quran-derived') {
      if (!ev.form) P(id, 'a quran-derived Name needs the form');
      else {
        const r = refs[0];
        const texts = [];
        for (let a = r.ayah; a <= (r.ayahEnd ?? r.ayah); a++) texts.push(clean(ayahText(r.surahId, a) ?? ''));
        if (!texts.join(' ').includes(ev.form)) P(id, `form "${ev.form}" is not in ${r.surahId}:${r.ayah}`);
      }
    } else if (refs.length) P(id, `a ${ev.kind} Name cites no ayah as evidence`);
  });
  return problems;
}

export function readItems() {
  const dir = join(HERE, 'items');
  return readdirSync(dir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const items = readItems();
  if (process.argv.includes('--print')) {
    for (const it of items) {
      console.log(`\n${it.id} ${it.transliteration} [${it.evidence.kind}] ${it.meaning}`);
      for (const r of it.evidence.quran ?? []) {
        for (let a = r.ayah; a <= (r.ayahEnd ?? r.ayah); a++) console.log(`  ${r.surahId}:${a} ${ayahText(r.surahId, a)}`);
      }
      if (it.evidence.form) console.log(`  form: ${it.evidence.form}`);
    }
  }
  const problems = checkNames(items);
  console.log(problems.length ? `Problems (${problems.length}):\n${problems.join('\n')}` : `All ${items.length} Names check out.`);
  process.exit(problems.length ? 1 : 0);
}
