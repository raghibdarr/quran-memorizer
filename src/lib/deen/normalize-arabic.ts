// The consonantal skeleton of Arabic text (all-in-one spec 5.1): what two
// witnesses must agree on for a hadith or dhikr text to ship. Diacritics,
// Quranic annotation marks, tatweel, punctuation and digits are stripped; alef
// and hamza seat forms are folded together; whitespace is collapsed.
//
// scripts/build-deen.mjs carries an identical copy (it runs in plain Node);
// normalize-arabic.test.ts keeps the two in step.

const STRIP = new RegExp(
  [
    '[ً-ٟ]', // harakat, tanwin, shadda, sukun, maddah/hamza marks
    'ٰ', // dagger (superscript) alef
    '[ؐ-ؚ]', // honorific and small signs above
    '[ۖ-ۭ]', // Quranic annotation marks (waqf signs, small letters)
    '[࣓-ࣿ]', // extended Arabic marks
    'ـ', // tatweel
    '[،؛؟٪-٭۔]', // Arabic comma, semicolon, question mark, percent, stars, full stop
    '[﴾﴿«»]', // ornate parentheses, guillemets
    '[٠-٩۰-۹0-9]', // digits
    '[.,:;!?"\'()\\[\\]{}\\-–—…]', // Latin punctuation
    '[​-‏‪-‮⁦-⁩﻿]', // zero-width and direction marks
  ].join('|'),
  'g',
);

const FOLD: Record<string, string> = {
  'آ': 'ا', // آ → ا
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'ٱ': 'ا', // ٱ → ا
  'ٲ': 'ا', // ٲ → ا
  'ٳ': 'ا', // ٳ → ا
  'ؤ': 'و', // ؤ → و
  'ئ': 'ي', // ئ → ي
  'ى': 'ي', // ى → ي
  'ی': 'ي', // Persian yeh → ي
  'ک': 'ك', // keheh → ك
};

/** The consonantal skeleton used for witness collation */
export function arabicSkeleton(text: string): string {
  return text
    .normalize('NFC')
    .replace(STRIP, '')
    .replace(/[آأإٱٲٳؤئىیک]/g, (c) => FOLD[c])
    .replace(/\s+/g, ' ')
    .trim();
}

/** A looser key for finding a word inside Quran text: the skeleton without alefs,
 *  hamzas or spaces (Uthmani spelling drops and adds alefs the plain spelling has) */
export function looseSkeleton(text: string): string {
  return arabicSkeleton(text).replace(/[اء\s]/g, '');
}

/** True when `text` carries no Arabic diacritics at all (an unvocalised text) */
export function isUnvocalised(text: string): boolean {
  return !/[ً-ْٰ]/.test(text);
}
