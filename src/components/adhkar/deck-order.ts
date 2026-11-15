// The order a deck's items are listed in on /adhkar/view: the order a person
// says them in, not the id order the build emits. A deck with groups shows a
// small heading over each. Ids a deck has not shipped are skipped, and a shipped
// id missing here is listed at the end, so a new item never disappears.

import type { TextItem } from '@/types/deen';

export interface DeckGroup {
  /** Shown over the group; omitted for a deck read as one list */
  title?: string;
  ids: readonly string[];
}

export const DECK_ORDER: Readonly<Record<string, readonly DeckGroup[]>> = {
  // As the morning and evening sets say them, the evening-only and daily items in their place
  'adhkar-morning-evening': [
    {
      ids: [
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
        'kalimat-allah-tammat',
        'subhanallah-wa-bihamdihi',
        'la-ilaha-illallah-100',
      ],
    },
  ],
  // As the after-prayer set says them
  'adhkar-after-prayer': [
    { ids: ['istighfar-3', 'anta-al-salam', 'la-mania', 'la-hawla-la-nabudu', 'tamam-al-mia', 'aini-ala-dhikrik', 'taawwudh-sad'] },
  ],
  'adhkar-sleep-waking': [
    { title: 'Before sleep', ids: ['ayat-al-kursi', 'baqarah-end', 'ikhlas', 'falaq', 'nas', 'bismika-rabbi', 'bismika-amutu', 'aslamtu-nafsi'] },
    { title: 'On waking', ids: ['ahyana'] },
  ],
  'duas-daily': [
    { title: 'Home and mosque', ids: ['leaving-home', 'entering-mosque', 'leaving-mosque'] },
    { title: 'The toilet', ids: ['toilet-enter', 'toilet-leave'] },
    { title: 'Eating and fasting', ids: ['forgot-bismillah', 'after-eating', 'iftar'] },
    { title: 'Travel', ids: ['travel', 'stopping-place'] },
    { title: 'Rain and sneezing', ids: ['rain', 'sneezing'] },
    { title: 'Hard moments', ids: ['anger', 'distress', 'worry'] },
    { title: 'Deciding', ids: ['istikhara'] },
  ],
  // In the order of the prayer; the two openings first, the witr qunut last
  'salah-words': [
    { ids: ['subhanaka', 'istiftah', 'ruku', 'rising-from-ruku', 'sujud', 'tashahhud', 'salat-ibrahimiyya', 'qunut-al-witr'] },
  ],
};

export interface OrderedGroup {
  title?: string;
  items: TextItem[];
}

/** A deck's shipped items in their listed order and groups (empty groups dropped) */
export function orderDeck(deck: string, items: readonly TextItem[]): OrderedGroup[] {
  const groups = DECK_ORDER[deck] ?? [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const placed = new Set<string>();
  const out: OrderedGroup[] = [];
  for (const g of groups) {
    const list: TextItem[] = [];
    for (const id of g.ids) {
      const item = byId.get(id);
      if (item && !placed.has(id)) {
        list.push(item);
        placed.add(id);
      }
    }
    if (list.length) out.push({ title: g.title, items: list });
  }
  const rest = items.filter((i) => !placed.has(i.id));
  if (rest.length) {
    // With headings, the leftovers need one too; without, they simply follow
    if (out.some((g) => g.title)) out.push({ title: 'More', items: rest });
    else if (out.length) out[out.length - 1].items.push(...rest);
    else out.push({ items: rest });
  }
  return out;
}
