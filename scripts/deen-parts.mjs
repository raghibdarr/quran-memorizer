#!/usr/bin/env node
// Authoring aid for the learning parts of a deen text item (STYLE.md, "Learning
// parts"). Offsets are tedious to count by hand, so parts are given as word
// numbers and this writes the character offsets.
//
//   node scripts/deen-parts.mjs show content/deen/nawawi40/items/11.json
//       numbers every Arabic and English word, and prints the parts side by side
//   node scripts/deen-parts.mjs set <file> --ar 9,18,23,30 --en 12,32,40,52
//       each number is the last word of a part (the last one is the last word)
//   node scripts/deen-parts.mjs clear <file>
//
// It never touches the Arabic or the translation. Run build-deen afterwards:
// that is where the parts are validated and emitted.

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Start and end offsets of every whitespace-separated word */
export function wordSpans(text) {
  return [...text.matchAll(/\S+/g)].map((m) => ({ word: m[0], start: m.index, end: m.index + m[0].length }));
}

/** Character offsets where parts end, from the (1-based) number of each part's last word */
export function offsetsFromWordEnds(text, lastWords) {
  const spans = wordSpans(text);
  return lastWords.map((n, i) => {
    if (!Number.isInteger(n) || n < 1 || n > spans.length) throw new Error(`word ${n} is out of range (1 to ${spans.length})`);
    // The final part runs to the end of the text, trailing characters included
    return i === lastWords.length - 1 && n === spans.length ? text.length : spans[n - 1].end;
  });
}

/** The parts of a text, from its end offsets */
export function slices(text, ends) {
  let start = 0;
  return ends.map((e) => {
    const s = text.slice(start, e).replace(/\s+/g, ' ').trim();
    start = e;
    return s;
  });
}

function withParts(item, parts) {
  const out = {};
  const { parts: _old, ...rest } = item;
  void _old;
  for (const [k, v] of Object.entries(rest)) {
    out[k] = v;
    if (k === 'translation' && parts) out.parts = parts;
  }
  return out;
}

function show(file) {
  const item = JSON.parse(readFileSync(file, 'utf8'));
  const number = (text) => wordSpans(text).map((s, i) => `${i + 1}:${s.word}`).join(' ');
  console.log(`${item.deck}:${item.id}  ${item.title}`);
  console.log(number(item.arabic ?? ''));
  console.log(number(item.translation ?? ''));
  if (item.parts) {
    const ar = slices(item.arabic, item.parts.ar);
    const en = slices(item.translation, item.parts.en);
    ar.forEach((a, i) => console.log(`\n${i + 1}. ${a}\n   ${en[i] ?? '(no English part)'}`));
  } else console.log('\n(no parts: learned whole)');
}

function main(argv) {
  const [cmd, file, ...rest] = argv;
  if (!cmd || !file) {
    console.error('usage: deen-parts.mjs show|set|clear <item.json> [--ar n,n,… --en n,n,…]');
    process.exit(2);
  }
  if (cmd === 'show') return show(file);
  const item = JSON.parse(readFileSync(file, 'utf8'));
  if (cmd === 'clear') {
    writeFileSync(file, JSON.stringify(withParts(item, null), null, 2) + '\n');
    return;
  }
  if (cmd !== 'set') throw new Error(`unknown command ${cmd}`);
  const list = (flag) => (rest[rest.indexOf(flag) + 1] ?? '').split(',').map(Number);
  const parts = { ar: offsetsFromWordEnds(item.arabic, list('--ar')), en: offsetsFromWordEnds(item.translation, list('--en')) };
  writeFileSync(file, JSON.stringify(withParts(item, parts), null, 2) + '\n');
  show(file);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
