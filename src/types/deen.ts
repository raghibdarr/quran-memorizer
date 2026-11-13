// Religious content types (all-in-one spec 5.3). These are a contract: the build
// script (scripts/build-deen.mjs) validates authored items against them, and the
// deen engine, decks and course read the emitted JSON through them.

export type ReviewStatus = 'draft' | 'source-checked' | 'scholar-reviewed';

export interface QuranRef {
  surahId: number;
  ayah: number;
  ayahEnd?: number;
}

export interface Citation {
  /** An id from content/deen/collections.json ('bukhari', 'muslim', …) */
  collection: string;
  number: string;
  /** An id from collections.json numberings ('fath-al-bari', 'abd-al-baqi', …) */
  numbering: string;
  book?: string;
  narrator?: string;
  altNumbers?: { numbering: string; number: string }[];
}

export interface Grading {
  grade: 'sahih' | 'hasan' | 'daif' | 'mawquf' | 'mursal' | 'agreed-upon' | 'in-sahih';
  /** An id from content/deen/scholars.json */
  by: string;
  /** The work and place the verdict was found ("al-Jami', after the hadith") */
  in: string;
  /** The verdict in the scholar's own Arabic words */
  quote?: string;
}

export interface Provenance {
  witnesses: { name: string; ref: string; skeletonSha256: string }[];
  note?: string;
}

export interface Review {
  status: ReviewStatus;
  /** Reviewer ids from content/deen/reviewers.json */
  by?: string[];
  date?: string;
  log?: string[];
}

export interface Note {
  text: string;
  source: { work: string; location: string };
}

export interface TextItem {
  id: string;
  deck: string;
  rev: number;
  title: string;
  cue: string;
  quran?: QuranRef;
  arabic?: string;
  /** Character offsets into `arabic` where each authored segment ends (sentence ends only) */
  segments?: number[];
  transliteration?: string;
  translation?: string;
  citations: Citation[];
  gradings: Grading[];
  provenance?: Provenance;
  notes?: Note[];
  usage?: { when: string[]; repeat?: number; evidence?: string };
  variants?: { label: string; arabic: string; citations: Citation[] }[];
  review: Review;
}

export interface NameItem {
  id: string;
  rev: number;
  order: number;
  arabic: string;
  transliteration: string;
  meaning: string;
  explanation: string;
  evidence: {
    kind: 'quran-name' | 'quran-derived' | 'hadith' | 'list-only';
    quran?: QuranRef[];
    form?: string;
    hadith?: string;
  };
  explanationSource?: { work: string; location: string };
  review: Review;
}

export type School = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

export type ClaimEvidence =
  | { quran: QuranRef }
  | { item: string }
  | { consensus: { work: string; location: string } };

export interface Position {
  school: School;
  text: string;
  source: { work: string; location: string };
  quote?: string;
}

export interface ClaimCard {
  id: string;
  front: string;
  back: string;
  school?: string;
}

export interface Claim {
  id: string;
  text: string;
  kind: 'agreed' | 'differs' | 'definition' | 'how-to';
  evidence: ClaimEvidence[];
  positions?: Position[];
  cards: ClaimCard[];
}

export interface Lesson {
  id: string;
  unit: string;
  order: number;
  rev: number;
  title: string;
  intro: string;
  claims: Claim[];
  check: { q: string; options: string[]; answer: number; claim: string }[];
  review: Review;
}

export interface GlossaryTerm {
  id: string;
  arabic: string;
  translit: string;
  short: string;
  long?: string;
  seeAlso?: string[];
}

/** What kind of items a deck holds */
export type DeckKind = 'hadith' | 'dhikr' | 'names' | 'course';

/** The emitted file for one deck: src/data/deen/<deck>.json */
export interface EmittedDeck {
  deck: string;
  kind: DeckKind;
  /** Build stamp of the content (not a time: a hash, so re-emitting is stable) */
  hash: string;
  items: (TextItem | NameItem | Lesson)[];
}

/** How deep a learner goes with a deck */
export type DeckDepth = 'meaning' | 'arabic';
