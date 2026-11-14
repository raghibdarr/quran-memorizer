// Display names for the ids deen items cite (collections, numberings, scholars,
// works, reviewers). Items store ids; these turn them into the words a reader
// sees. Read from the shared registry files in content/deen. A package's
// registry-additions.json sidecar is merged by the build script only, so an id
// that exists only in a sidecar falls back to a readable form of the id until
// the build emits a merged registry (HANDOFF.md).

import type { Citation } from '@/types/deen';
import collectionsFile from '../../../content/deen/collections.json';
import scholarsFile from '../../../content/deen/scholars.json';
import worksFile from '../../../content/deen/works.json';
import reviewersFile from '../../../content/deen/reviewers.json';

export interface CollectionEntry {
  id: string;
  name: string;
  arabic?: string;
  author?: string;
  sahih?: boolean;
  numberings?: string[];
  sunnahComSlug?: string;
}
export interface NumberingEntry { id: string; name: string; for?: string[] }
export interface ScholarEntry { id: string; name: string }
export interface WorkEntry { id: string; title: string; author?: string; kind?: string; school?: string }
export interface ReviewerEntry {
  id: string;
  name: string;
  /** e.g. "Imam, East London Mosque" */
  role?: string;
  /** What they reviewed, in plain words */
  scope?: string;
  since?: string;
}

const collections = new Map<string, CollectionEntry>(
  (collectionsFile as { collections: CollectionEntry[] }).collections.map((c) => [c.id, c]),
);
const numberings = new Map<string, NumberingEntry>(
  (collectionsFile as { numberings: NumberingEntry[] }).numberings.map((n) => [n.id, n]),
);
const scholars = new Map<string, ScholarEntry>(
  (scholarsFile as { scholars: ScholarEntry[] }).scholars.map((s) => [s.id, s]),
);
const works = new Map<string, WorkEntry>((worksFile as { works: WorkEntry[] }).works.map((w) => [w.id, w]));
const reviewers = new Map<string, ReviewerEntry>(
  (reviewersFile as unknown as ReviewerEntry[]).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]),
);

/** "ibn-hajar" → "Ibn hajar": readable, never blank, for ids the app has no name for */
export function humanizeId(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

export const collectionName = (id: string) => collections.get(id)?.name ?? humanizeId(id);
export const collectionInfo = (id: string) => collections.get(id);
export const scholarName = (id: string) => scholars.get(id)?.name ?? humanizeId(id);
/** A work's title; free text passes through unchanged, an unknown id is made readable */
export const workTitle = (idOrText: string) =>
  works.get(idOrText)?.title ?? (/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(idOrText) ? humanizeId(idOrText) : idOrText);
export const reviewerById = (id: string) => reviewers.get(id);
export const allReviewers = (): ReviewerEntry[] => [...reviewers.values()];

/**
 * The numbering scheme in a short form for the citation line: "Abd al-Baqi
 * numbering" from "Muhammad Fu'ad Abd al-Baqi's numbering".
 */
export function numberingLabel(id: string): string {
  const name = numberings.get(id)?.name;
  if (!name) return /numbering$/i.test(humanizeId(id)) ? humanizeId(id) : `${humanizeId(id)} numbering`;
  return name.replace(/^Muhammad Fu'ad /, '').replace(/^Abd al-Fattah /, '').replace(/'s numbering$/, ' numbering');
}

/**
 * The Sunnah.com page for a citation, when one is derivable: a hyperlink out,
 * never data (spec 5.1). Only for collections with a known slug, whose
 * numbering is that collection's own primary scheme, and a plain number.
 */
export function sunnahComUrl(c: Citation): string | null {
  const col = collections.get(c.collection);
  if (!col?.sunnahComSlug) return null;
  if (col.numberings?.[0] && col.numberings[0] !== c.numbering) return null;
  if (!/^\d+[a-z]?$/i.test(c.number.trim())) return null;
  return `https://sunnah.com/${col.sunnahComSlug}:${c.number.trim()}`;
}

/** "Sahih Muslim 2723 (Abd al-Baqi numbering)" */
export function citationText(c: Citation): string {
  return `${collectionName(c.collection)} ${c.number} (${numberingLabel(c.numbering)})`;
}
