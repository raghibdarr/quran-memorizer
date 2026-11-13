// Every deen deck (all-in-one spec 3.3): id, title, where it lives, and a lazy
// loader for its module under ./decks. Foundations owns this file; each content
// package replaces only its own deck module. A module with `ready: false` is
// hidden everywhere (Learn rows, review, glossary).

import type { DeckDepth, DeckKind, EmittedDeck, GlossaryTerm } from '@/types/deen';

export type DeckId =
  | 'nawawi40'
  | 'adhkar-morning-evening'
  | 'adhkar-after-prayer'
  | 'adhkar-sleep-waking'
  | 'duas-daily'
  | 'salah-words'
  | 'names99'
  | 'course-purification'
  | 'course-fasting';

/** What a deck module (src/content/deen/decks/<id>.ts) default-exports */
export type DeckModule =
  | { ready: false }
  | {
      ready: true;
      /** The emitted deck, src/data/deen/<id>.json (a dynamic import keeps it out of other screens) */
      load: () => Promise<EmittedDeck | { default: EmittedDeck }>;
      /** The package's glossary, src/data/deen/glossary/<pkg>.json, if it has one */
      glossary?: () => Promise<GlossaryTerm[] | { default: GlossaryTerm[] }>;
    };

/** Which Learn row a deck sits under */
export type DeckGroup = 'hadith' | 'adhkar' | 'names' | 'course';

export interface DeckInfo {
  id: DeckId;
  title: string;
  /** One line for lists */
  blurb: string;
  kind: DeckKind;
  group: DeckGroup;
  /** Where the deck is browsed */
  route: string;
  /** The depth a new learner starts at; null = ask them (spec 2.7) */
  defaultDepth: DeckDepth | null;
  module: () => Promise<{ default: DeckModule }>;
}

export const DECKS: readonly DeckInfo[] = [
  {
    id: 'nawawi40', title: 'Forty Hadith of al-Nawawi', blurb: 'The classic collection of core hadith',
    kind: 'hadith', group: 'hadith', route: '/hadith', defaultDepth: null,
    module: () => import('./decks/nawawi40'),
  },
  {
    id: 'adhkar-morning-evening', title: 'Morning and evening', blurb: 'Remembrance for the start and end of the day',
    kind: 'dhikr', group: 'adhkar', route: '/adhkar/view?d=adhkar-morning-evening', defaultDepth: 'arabic',
    module: () => import('./decks/adhkar-morning-evening'),
  },
  {
    id: 'adhkar-after-prayer', title: 'After the prayer', blurb: 'What to say once the prayer ends',
    kind: 'dhikr', group: 'adhkar', route: '/adhkar/view?d=adhkar-after-prayer', defaultDepth: 'arabic',
    module: () => import('./decks/adhkar-after-prayer'),
  },
  {
    id: 'adhkar-sleep-waking', title: 'Sleeping and waking', blurb: 'For bedtime and the moment you wake',
    kind: 'dhikr', group: 'adhkar', route: '/adhkar/view?d=adhkar-sleep-waking', defaultDepth: 'arabic',
    module: () => import('./decks/adhkar-sleep-waking'),
  },
  {
    id: 'duas-daily', title: 'Duas for the day', blurb: 'Eating, travelling, entering and leaving',
    kind: 'dhikr', group: 'adhkar', route: '/adhkar/view?d=duas-daily', defaultDepth: 'arabic',
    module: () => import('./decks/duas-daily'),
  },
  {
    id: 'salah-words', title: 'The words of the prayer', blurb: 'What is said in each position',
    kind: 'dhikr', group: 'adhkar', route: '/adhkar/view?d=salah-words', defaultDepth: 'arabic',
    module: () => import('./decks/salah-words'),
  },
  {
    id: 'names99', title: 'Names of Allah', blurb: 'The Names, their meanings and where they come from',
    kind: 'names', group: 'names', route: '/names', defaultDepth: 'meaning',
    module: () => import('./decks/names99'),
  },
  {
    id: 'course-purification', title: 'Purification', blurb: 'Wudu, ghusl and tayammum, step by step',
    kind: 'course', group: 'course', route: '/course', defaultDepth: 'meaning',
    module: () => import('./decks/course-purification'),
  },
  {
    id: 'course-fasting', title: 'Fasting', blurb: 'Ramadan and the fast, what holds and what differs',
    kind: 'course', group: 'course', route: '/course', defaultDepth: 'meaning',
    module: () => import('./decks/course-fasting'),
  },
];

export const DECK_IDS: readonly DeckId[] = DECKS.map((d) => d.id);

export function deckInfo(id: string): DeckInfo | undefined {
  return DECKS.find((d) => d.id === id);
}

export const GROUP_TITLES: Record<DeckGroup, string> = {
  hadith: 'Hadith',
  adhkar: 'Adhkar and duas',
  names: 'Names of Allah',
  course: 'Foundations course',
};
