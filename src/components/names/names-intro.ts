// The intro card for the Names deck (all-in-one spec 6, "99 Names"): where the
// number comes from, where the familiar list comes from, and why we teach it.
//
// Citation numbers were each confirmed in two online witnesses on 2026-11-14:
// al-Bukhari 2736 (Fath al-Bari numbering) and Muslim 2677 (Abd al-Baqi) in the
// takhrij on surahquran.com's hadith pages and on hadithanswers.com; al-Tirmidhi
// 3507 on hadithanswers.com and surahquran.com.
//
// Independent audit, 2026-11-15 (see content/deen/names99/AUDIT.md): the three numbers
// were confirmed again on dorar.net and in sunnah.com page views. Al-Tirmidhi's remark
// after the hadith ("hadha hadithun gharib ... wa-la na'rifuhu illa min hadith Safwan
// ibn Salih") was read in the Jami' and in Ibn Kathir's quotation of it. Ibn Kathir's
// sentence on 7:180 is "wa-lladhi 'awwala 'alayhi jama'atun min al-huffaz anna sard
// al-asma' fi hadha al-hadith mudraj fih". Ibn Hajar's sentence ("wa-khtalafa
// al-'ulama' fi sard al-asma', hal huwa marfu' aw mudraj ... fa-masha kathirun minhum
// 'ala al-awwal ... wa-dhahaba akharun ila anna al-ta'yin mudraj li-khuluww akthar
// al-riwayat 'anhu") was read only as quoted from Fath al-Bari 11/215 in a later
// study, not in a copy of the Fath itself. Both are cited by work and place, without
// volume or page numbers.

import type { Citation } from '@/types/deen';

export const INTRO_TITLE = 'How this list came to us';

export const INTRO_PARAGRAPHS: string[] = [
  "The Prophet ﷺ said that Allah has ninety-nine Names, one hundred less one, and whoever counts them (in another wording, memorises them) enters Paradise. Al-Bukhari and Muslim both record this, and neither lists the Names.",
  "The list most people know comes through one narration in al-Tirmidhi's Jami'. Al-Tirmidhi himself called it gharib: he knew it only through one narrator, Safwan ibn Salih. Scholars differ over the list itself. Ibn Hajar records that many took it as the words of the Prophet ﷺ, while others held that a narrator added it, since most routes of the hadith do not have it. Ibn Kathir says a group of the hadith masters relied on the second view.",
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
