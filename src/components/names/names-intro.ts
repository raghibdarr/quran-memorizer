// The intro card for the Names deck (all-in-one spec 6, "99 Names"): where the
// number comes from, where the familiar list comes from, and why we teach it.
//
// Citation numbers were each confirmed in two online witnesses on 2026-11-14:
// al-Bukhari 2736 (Fath al-Bari numbering) and Muslim 2677 (Abd al-Baqi) in the
// takhrij on surahquran.com's hadith pages and on hadithanswers.com; al-Tirmidhi
// 3507 on hadithanswers.com and surahquran.com. Ibn Hajar's and Ibn Kathir's remarks
// are cited by work and place, without volume or page numbers.

import type { Citation } from '@/types/deen';

export const INTRO_TITLE = 'How this list came to us';

export const INTRO_PARAGRAPHS: string[] = [
  "The Prophet ﷺ said that Allah has ninety-nine Names, one hundred less one, and whoever counts them (in another wording, memorises them) enters Paradise. Al-Bukhari and Muslim both record this, and neither lists the Names.",
  "The list most people know comes through one narration in al-Tirmidhi's Jami'. Al-Tirmidhi himself called it gharib: it reached him by a single route. Many hadith scholars, among them Ibn Hajar and Ibn Kathir, judged that the list was added by a narrator rather than said by the Prophet ﷺ.",
  'We teach it because it is the list people memorise, in its order. Each Name shows where it comes from: named in the Quran, taken from a word the Quran uses of Allah, named in a hadith, or found only in this list.',
];

/** The two Sahihs give the number; al-Tirmidhi gives the list */
export const INTRO_CITATIONS: Citation[] = [
  { collection: 'bukhari', number: '2736', numbering: 'fath-al-bari', narrator: 'Abu Hurayrah' },
  { collection: 'muslim', number: '2677', numbering: 'abd-al-baqi', narrator: 'Abu Hurayrah' },
  { collection: 'tirmidhi', number: '3507', numbering: 'ahmad-shakir', book: 'Book of Supplications', narrator: 'Abu Hurayrah' },
];

/** Where the scholars' judgements on the list are found */
export const INTRO_SOURCES: { who: string; work: string; location: string }[] = [
  { who: 'Ibn Hajar', work: 'Fath al-Bari', location: 'Book of Supplications, on the hadith of the ninety-nine Names' },
  { who: 'Ibn Kathir', work: 'Tafsir al-Quran al-Azim', location: "on al-A'raf 7:180" },
];
