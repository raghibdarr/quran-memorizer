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
  useVariant?: Readonly<Record<string, { index: number; mode: 'replace' | 'opening'; title?: string }>>;
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
    // al-mulku-lillah is stored in its evening wording (Muslim 2723); the morning opening is its variant
    useVariant: { 'al-mulku-lillah': { index: 0, mode: 'opening', title: 'We have reached the morning' } },
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
  /** Opening words to say instead of the text's own (shown above the Arabic) */
  opening?: string;
  /** How many times it is said (1 when the item gives no count) */
  repeat: number;
}

/** The steps of a set from a deck's shipped items (unknown ids skipped, order kept) */
export function stepsFor(set: AdhkarSet, items: readonly TextItem[]): SetStep[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: SetStep[] = [];
  for (const id of set.items) {
    const item = byId.get(id);
    if (!item) continue;
    const use = set.useVariant?.[id];
    const variant = use ? item.variants?.[use.index] : undefined;
    const repeat = item.usage?.repeat && item.usage.repeat > 1 ? Math.floor(item.usage.repeat) : 1;
    const title = (variant && use?.title) || item.title;
    if (item.quran) out.push({ item, title: item.title, repeat });
    else if (variant && use?.mode === 'opening') out.push({ item, title, arabic: item.arabic, variantLabel: variant.label, opening: variant.arabic, repeat });
    else out.push({ item, title, arabic: variant?.arabic ?? item.arabic, variantLabel: variant?.label, repeat });
  }
  return out;
}

/** Where a set is said, for /adhkar/now?set= */
export function nowHref(set: SetId): string {
  return `/adhkar/now?set=${set}`;
}
