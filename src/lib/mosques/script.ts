// How a mosque's name should be drawn. OSM names come in every script; the
// list's UI face (Plus Jakarta Sans) has no Arabic, so Arabic-script names get
// the app's Arabic face (Amiri Quran) when it can draw every letter, and the
// device's own Arabic face otherwise (Persian, Urdu and Pashto letters such as
// پ چ گ are not in Amiri Quran, and splitting one word across two fonts breaks
// the joins).

const ARABIC_LETTER = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;
const FIRST_LETTER = /\p{L}/u;

// Everything Amiri Quran draws that a name could use: ASCII, Arabic letters,
// harakat, tatweel, Arabic and Persian digits, Arabic punctuation, joiners
const IN_AMIRI = /^[ -~ ،؛؟ء-غـ-٘٠-٩ٮ-ٱی۰-۹‌-‏]*$/;

/** True when the name's first letter is in Arabic script (Arabic, Persian, Urdu, ...) */
export function isArabicScript(name: string): boolean {
  const first = name.match(FIRST_LETTER);
  return !!first && ARABIC_LETTER.test(first[0]);
}

/** True when the app's Arabic face can draw the whole name */
export function fitsAppArabicFace(name: string): boolean {
  return IN_AMIRI.test(name);
}
