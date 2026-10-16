// Writes textUthmaniTajweed in src/data/surah-N.json from open data (licensing audit,
// 2026-10-16: nothing from api.quran.com):
//   rules  cpfair/quran-tajweed (CC BY 4.0, https://github.com/cpfair/quran-tajweed): each
//          rule as a character range in Tanzil's Uthmani text as it stood in April 2017
//          (data-sources/cpfair-tajweed/quran-uthmani-2017.txt)
//   text   our ayah text, Tanzil's current Uthmani (scripts/build-arabic-text.mjs)
// Tanzil's encoding has changed a little since 2017 (tatweel before the superscript alef,
// for one), so each ayah's 2017 text is aligned to today's character by character and the
// ranges carried across. Output uses the tag and class names the app already renders and
// explains (globals.css, tajweed-explainer.tsx), so nothing downstream changes.
// Run: node scripts/build-tajweed.mjs [--check]
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const dir = join(root, 'data-sources', 'cpfair-tajweed');

/** cpfair rule → the app's class */
const CLASS = {
  hamzat_wasl: 'ham_wasl',
  lam_shamsiyyah: 'laam_shamsiyah',
  silent: 'slnt',
  madd_2: 'madda_normal',
  madd_246: 'madda_permissible',
  // Coloured with the connected madd, both held 4 or 5 counts in Hafs (as the app always has)
  madd_munfasil: 'madda_obligatory',
  madd_muttasil: 'madda_obligatory',
  madd_6: 'madda_necessary',
  ghunnah: 'ghunnah',
  ikhfa: 'ikhafa',
  ikhfa_shafawi: 'ikhafa_shafawi',
  idghaam_ghunnah: 'idgham_ghunnah',
  idghaam_no_ghunnah: 'idgham_wo_ghunnah',
  idghaam_shafawi: 'idgham_shafawi',
  idghaam_mutajanisayn: 'idgham_mutajanisayn',
  idghaam_mutaqaribayn: 'idgham_mutaqaribayn',
  iqlab: 'iqlab',
  qalqalah: 'qalaqah',
};

const old = new Map();
for (const line of readFileSync(join(dir, 'quran-uthmani-2017.txt'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^(\d+)\|(\d+)\|(.*)$/);
  if (m) old.set(`${m[1]}:${m[2]}`, m[3]);
}
const rules = new Map();
for (const a of JSON.parse(readFileSync(join(dir, 'tajweed.hafs.uthmani-pause-sajdah.json'), 'utf8'))) rules.set(`${a.surah}:${a.ayah}`, a.annotations);

/** For each index of `a`, its index in `b` (-1 where the character was dropped): an LCS alignment */
export function align(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const map = new Int32Array(n).fill(-1);
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { map[i++] = j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return map;
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const ZWNJ = String.fromCharCode(0x200c), NBSP = String.fromCharCode(0xa0);
/** Pause marks, U+06D6 to U+06DC */
const PAUSE = `[${String.fromCharCode(0x6d6)}-${String.fromCharCode(0x6dc)}]`;
/** Vowel signs and Quranic annotation signs that sit on a letter (not pause marks) */
const MARK = new RegExp(`[${String.fromCharCode(0x64b)}-${String.fromCharCode(0x65f)}${String.fromCharCode(0x670)}${String.fromCharCode(0x6df)}-${String.fromCharCode(0x6e8)}${String.fromCharCode(0x6ea)}-${String.fromCharCode(0x6ed)}]`);
const TATWEEL = String.fromCharCode(0x640);
/** Any Arabic letter (hamza to yeh, alef wasla to yeh barree) */
const LETTER = new RegExp(`[${String.fromCharCode(0x621)}-${String.fromCharCode(0x64a)}${String.fromCharCode(0x671)}-${String.fromCharCode(0x6d3)}]`);

/**
 * @param joined words the lessons count as one though Tanzil spaces them (بَعْدَ مَا in four
 *   ayahs): their space becomes a no-break space so the markup splits like the word list
 */
export function tajweedHtml(text, oldText, annotations, ayahNumber, joined = []) {
  for (const w of joined) {
    const at = text.indexOf(w);
    if (at < 0) throw new Error(`joined word ${w} not in the text`);
    text = text.slice(0, at) + w.replace(' ', NBSP) + text.slice(at + w.length);
  }
  const map = align(oldText, text);
  // Carry each range over; a range keeps any characters added inside it (a tatweel)
  const spans = [];
  for (const { rule, start, end } of [...annotations].sort((x, y) => x.start - y.start || y.end - x.end)) {
    const cls = CLASS[rule];
    if (!cls) throw new Error(`unknown rule ${rule}`);
    const hit = [];
    for (let k = start; k < end; k++) if (map[k] >= 0) hit.push(map[k]);
    if (!hit.length) continue;
    const s = Math.min(...hit), e = Math.max(...hit) + 1;
    // The source overlaps 40 times in 53,884 rules; the first rule wins, as tags can't cross
    if (spans.length && s < spans[spans.length - 1].e) continue;
    spans.push({ s, e, cls });
  }
  // A browser can't colour a vowel sign apart from its letter, so a span that starts on a
  // sign takes in the letter it sits on (as the app's markup always has), and a span takes
  // the signs of its last letter with it. Spans that are only signs (a madd's superscript
  // alef) are left for normalizeTajweedText, which handles them when the app loads.
  spans.forEach((sp, i) => {
    const before = i > 0 ? spans[i - 1].e : 0, after = i < spans.length - 1 ? spans[i + 1].s : text.length;
    if (MARK.test(text[sp.s]) && LETTER.test(text.slice(sp.s, sp.e)))
      while (sp.s > before && (MARK.test(text[sp.s]) || text[sp.s] === TATWEEL)) sp.s--;
    if (LETTER.test(text.slice(sp.s, sp.e))) while (sp.e < after && MARK.test(text[sp.e])) sp.e++;
  });
  let html = '', at = 0;
  for (const { s, e, cls } of spans) {
    html += text.slice(at, s) + `<tajweed class=${cls}>` + text.slice(s, e) + '</tajweed>';
    at = e;
  }
  html += text.slice(at);
  // A pause mark rides on its word (zero-width non-joiner instead of the space), so the
  // markup splits into the same words as the word list; then the verse number
  html = html.replace(new RegExp(` (${PAUSE})`, 'g'), `${ZWNJ}$1`);
  const num = String(ayahNumber).replace(/\d/g, (d) => ARABIC_DIGITS[d]);
  // The end-of-ayah sign before the number: Amiri Quran draws them as one ornament
  return `${html} <span class=end>${String.fromCharCode(0x6dd)}${num}</span>`;
}

let total = 0, dropped = 0;
const splitCount = (html) => html.replace(/<[^>]+>/g, '').split(' ').filter((t) => LETTER.test(t)).length;
const plain = (html) => html.replace(/<[^>]+>/g, '').split(ZWNJ).join(' ').split(NBSP).join(' ').replace(/ \S+$/, '');
for (let s = 1; s <= 114; s++) {
  const file = join(root, 'src', 'data', `surah-${s}.json`);
  const surah = JSON.parse(readFileSync(file, 'utf8'));
  for (const a of surah.ayahs) {
    const oldText = old.get(a.key), ann = rules.get(a.key);
    if (oldText == null || !ann) throw new Error(`no tajweed source for ${a.key}`);
    // A word holding a space between two lettered parts is two Tanzil words joined
    const joined = a.words
      .filter((w) => w.charType === 'word' && w.textUthmani.split(' ').filter((p) => LETTER.test(p)).length > 1)
      .map((w) => w.textUthmani);
    const html = tajweedHtml(a.textUthmani, oldText, ann, a.number, joined);
    const words = a.words.filter((w) => w.charType === 'word').length;
    if (splitCount(html) !== words) throw new Error(`${a.key}: tajweed splits into ${splitCount(html)} words, not ${words}`);
    if (plain(html) !== a.textUthmani) throw new Error(`${a.key}: text changed`);
    total += ann.length;
    dropped += ann.length - (html.match(/<tajweed /g) ?? []).length;
    a.textUthmaniTajweed = html;
  }
  if (!check) writeFileSync(file, JSON.stringify(surah, null, 2));
}
console.log(`${check ? 'checked' : 'wrote'} tajweed for 6236 ayahs: ${total - dropped} of ${total} rules placed`);
