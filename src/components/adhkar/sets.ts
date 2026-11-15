// "Pray it now" sets (all-in-one spec 2.7): which items a set walks through, in
// which order, and which set fits the moment. Pure, so the /prayer chip and the
// tests share it. An id listed here that a deck did not ship (still a draft) is
// simply skipped.

import type { PrayerName } from '@/types/prayer';
import type { TextItem } from '@/types/deen';

export type SetId = 'morning' | 'evening' | 'after-prayer' | 'sleep';

export interface AdhkarSet {
  id: SetId;
  title: string;
  /** "Morning adhkar" in the chip and the header */
  short: string;
  deck: string;
  /** Item ids in the order they are said */
  items: readonly string[];
  /**
   * Items whose wording changes with the set: the variant (by its index in
   * item.variants) to show. 'replace' shows the variant instead of the item's
   * Arabic; 'opening' keeps the item's Arabic and shows the variant above it as
   * the opening words to use (the source gives only the changed opening).
   * `title` heads the step in this set, where the item's own title names the other time of day
   */
  useVariant?: Readonly<Record<string, VariantUse>>;
  /**
   * Counted steps said just before an item, from the same hadith: after the
   * prayer, the thirty-three of each before "Completing the hundred" (Muslim 597)
   */
  leadIns?: Readonly<Record<string, readonly LeadIn[]>>;
}

export interface VariantUse {
  index: number;
  mode: 'replace' | 'opening';
  /** Heads the step in this set, where the item's own title names the other time of day */
  title?: string;
  /**
   * For 'opening': the English of the variant's opening words, and the words of
   * the item's English they stand in for (our translation's own opening clause)
   */
  openingEnglish?: string;
  replacesEnglish?: string;
  /** The same pair for the transliteration (the item's house spelling, with the variant's words) */
  openingTranslit?: string;
  replacesTranslit?: string;
}

/**
 * One phrase said a counted number of times before an item. The words are the
 * Essentials tasbih items' checked Arabic and English (src/data/essentials.json,
 * kept equal by a test); the count and the citation are the following item's hadith.
 */
export interface LeadIn {
  key: string;
  title: string;
  arabic: string;
  transliteration: string;
  translation: string;
  repeat: number;
  when?: string;
}

export const SET_IDS: readonly SetId[] = ['morning', 'evening', 'after-prayer', 'sleep'];

export const ADHKAR_SETS: Readonly<Record<SetId, AdhkarSet>> = {
  morning: {
    id: 'morning',
    title: 'Morning adhkar',
    short: 'Morning',
    deck: 'adhkar-morning-evening',
    items: [
      'ikhlas',
      'falaq',
      'nas',
      'sayyid-al-istighfar',
      'bika-asbahna',
      'al-mulku-lillah',
      'alim-al-ghayb',
      'bismillah-la-yadurr',
      'afiya',
      'adada-khalqihi',
      'subhanallah-wa-bihamdihi',
      'la-ilaha-illallah-100',
    ],
    // al-mulku-lillah is stored in its evening wording (Muslim 2723); the morning opening is its variant.
    // The English of that opening is our translation of the evening one with morning for evening
    useVariant: {
      'al-mulku-lillah': {
        index: 0,
        mode: 'opening',
        title: 'We have reached the morning',
        openingEnglish: 'We have reached the morning, and the dominion belongs to Allah,',
        replacesEnglish: 'We have reached the evening, and the dominion belongs to Allah,',
        openingTranslit: "Asbahnaa wa'asbahal-mulku lillaah,",
        replacesTranslit: "Amsaynaa wa'amsal-mulku lillaah,",
      },
    },
  },
  evening: {
    id: 'evening',
    title: 'Evening adhkar',
    short: 'Evening',
    deck: 'adhkar-morning-evening',
    items: [
      'ikhlas',
      'falaq',
      'nas',
      'sayyid-al-istighfar',
      'bika-asbahna',
      'al-mulku-lillah',
      'alim-al-ghayb',
      'bismillah-la-yadurr',
      'afiya',
      'kalimat-allah-tammat',
      'subhanallah-wa-bihamdihi',
    ],
    // bika-asbahna is stored in its morning wording; the evening one is its first variant
    useVariant: { 'bika-asbahna': { index: 0, mode: 'replace', title: 'By You we enter the evening' } },
  },
  'after-prayer': {
    id: 'after-prayer',
    title: 'After the prayer',
    short: 'After prayer',
    deck: 'adhkar-after-prayer',
    items: ['istighfar-3', 'anta-al-salam', 'la-mania', 'la-hawla-la-nabudu', 'tamam-al-mia', 'aini-ala-dhikrik', 'taawwudh-sad'],
    // Muslim 597: glorify, praise and magnify Allah thirty-three times each, then complete the hundred
    leadIns: {
      'tamam-al-mia': [
        { key: 'subhanallah', title: 'SubhanAllah', arabic: 'سُبْحَانَ اللَّهِ', transliteration: 'SubhaanAllah', translation: 'Glory be to Allah', repeat: 33, when: 'Thirty-three times each, then the words that complete the hundred' },
        { key: 'alhamdulillah', title: 'Alhamdulillah', arabic: 'الْحَمْدُ لِلَّهِ', transliteration: 'Alhamdulillah', translation: 'All praise is due to Allah', repeat: 33 },
        { key: 'allahu-akbar', title: 'Allahu akbar', arabic: 'اللَّهُ أَكْبَرُ', transliteration: 'Allahu Akbar', translation: 'Allah is the Greatest', repeat: 33 },
      ],
    },
  },
  sleep: {
    id: 'sleep',
    title: 'Before sleep',
    short: 'Sleep',
    deck: 'adhkar-sleep-waking',
    items: ['ayat-al-kursi', 'baqarah-end', 'ikhlas', 'falaq', 'nas', 'bismika-rabbi', 'bismika-amutu', 'aslamtu-nafsi'],
  },
};

export function isSetId(v: string | null | undefined): v is SetId {
  return !!v && (SET_IDS as readonly string[]).includes(v);
}

/** The prayers that have adhkar after them (sunrise is a time, not a prayer) */
const AFTER_PRAYER: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const PRAYER_LABEL: Record<string, string> = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };

export interface NowChoice {
  set: SetId;
  /** "Morning adhkar", "After Dhuhr adhkar" */
  label: string;
}

/**
 * The sets that fit now, for the chips on /prayer (spec 2.7): the adhkar after
 * the prayer whose time has entered, and with them the morning set from Fajr to
 * sunrise or the evening set from Asr to Maghrib. The two overlap after Fajr and
 * after Asr, when both are said, so both are offered: the prayer's own adhkar
 * first, as they are said first. Empty when nothing fits.
 */
export function setsForNow(window: 'morning' | 'evening' | null, afterPrayer: PrayerName | null): NowChoice[] {
  const out: NowChoice[] = [];
  if (afterPrayer && AFTER_PRAYER.includes(afterPrayer)) out.push({ set: 'after-prayer', label: `After ${PRAYER_LABEL[afterPrayer]} adhkar` });
  if (window === 'morning') out.push({ set: 'morning', label: 'Morning adhkar' });
  if (window === 'evening') out.push({ set: 'evening', label: 'Evening adhkar' });
  return out;
}

/** One step of a set: the item, the Arabic to show (a variant's, for some sets) and how many times */
export interface SetStep {
  item: TextItem;
  /** The step's heading (the item's title, unless the set shows another time of day's wording) */
  title: string;
  /** The Arabic to show; undefined for a Quran item (it renders from the surah files) */
  arabic?: string;
  /** The wording's label when a variant is shown ("In the evening: …") */
  variantLabel?: string;
  /** The English to show in place of the item's (a replaced wording's, from its label) */
  english?: string;
  /** Opening words to say instead of the text's own */
  opening?: string;
  /** The words of `arabic` the opening stands in for, and the rest that follows them */
  openingReplaces?: string;
  arabicRest?: string;
  /** The same split for the English, when the set gives the opening's English */
  openingEnglish?: string;
  englishReplaces?: string;
  englishRest?: string;
  translitOpening?: string;
  translitReplaces?: string;
  translitRest?: string;
  /** How many times it is said (1 when the item gives no count) */
  repeat: number;
}

/** The English inside a replaced wording's label: 'In the evening: "O Allah, …"' gives 'O Allah, …' */
export function labelEnglish(label: string): string | undefined {
  const m = /^[^":]+:\s*"(.+)"\s*$/.exec(label.trim());
  return m?.[1];
}

/** Splits `text` after as many words as `opening` has, when it has more */
function splitWords(text: string, opening: string): [string, string] | null {
  const n = opening.trim().split(/\s+/).length;
  const words = text.trim().split(/\s+/);
  if (words.length <= n) return null;
  return [words.slice(0, n).join(' '), words.slice(n).join(' ')];
}

/** A lead-in as an item of its own, carrying the following item's citation and review */
function leadInItem(item: TextItem, l: LeadIn): TextItem {
  return {
    id: `${item.id}:${l.key}`,
    deck: item.deck,
    rev: item.rev,
    title: l.title,
    cue: l.translation,
    arabic: l.arabic,
    transliteration: l.transliteration,
    translation: l.translation,
    citations: item.citations,
    gradings: item.gradings,
    usage: { when: l.when ? [l.when] : [], repeat: l.repeat },
    review: item.review,
  };
}

/** The steps of a set from a deck's shipped items (unknown ids skipped, order kept) */
export function stepsFor(set: AdhkarSet, items: readonly TextItem[]): SetStep[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: SetStep[] = [];
  for (const id of set.items) {
    const item = byId.get(id);
    if (!item) continue;
    for (const l of set.leadIns?.[id] ?? []) out.push({ item: leadInItem(item, l), title: l.title, arabic: l.arabic, repeat: l.repeat });
    const use = set.useVariant?.[id];
    const variant = use ? item.variants?.[use.index] : undefined;
    const repeat = item.usage?.repeat && item.usage.repeat > 1 ? Math.floor(item.usage.repeat) : 1;
    const title = (variant && use?.title) || item.title;
    if (item.quran) out.push({ item, title: item.title, repeat });
    else if (variant && use?.mode === 'opening') {
      const step: SetStep = { item, title, arabic: item.arabic, variantLabel: variant.label, opening: variant.arabic, repeat };
      const split = item.arabic ? splitWords(item.arabic, variant.arabic) : null;
      if (split) [step.openingReplaces, step.arabicRest] = split;
      const tr = item.translation;
      if (use.openingEnglish && use.replacesEnglish && tr?.startsWith(use.replacesEnglish)) {
        step.openingEnglish = use.openingEnglish;
        step.englishReplaces = use.replacesEnglish;
        step.englishRest = tr.slice(use.replacesEnglish.length).trim();
      }
      const tl = item.transliteration;
      if (use.openingTranslit && use.replacesTranslit && tl?.startsWith(use.replacesTranslit)) {
        step.translitOpening = use.openingTranslit;
        step.translitReplaces = use.replacesTranslit;
        step.translitRest = tl.slice(use.replacesTranslit.length).trim();
      }
      out.push(step);
    } else {
      out.push({ item, title, arabic: variant?.arabic ?? item.arabic, variantLabel: variant?.label, english: variant ? labelEnglish(variant.label) : undefined, repeat });
    }
  }
  return out;
}

/** Where a set is said, for /adhkar/now?set= */
export function nowHref(set: SetId): string {
  return `/adhkar/now?set=${set}`;
}
