// Display names for the ids deen items cite (collections, numberings, scholars,
// works, reviewers). Items store ids; these turn them into the words a reader
// sees. Read from the shared registry files in content/deen plus each package's
// registry-additions.json sidecar (listed in SIDECARS below; a test fails when a
// new sidecar is not listed). The shared files win, as in the build script. An
// id found nowhere falls back to a readable form of the id.

import type { Citation } from '@/types/deen';
import collectionsFile from '../../../content/deen/collections.json';
import scholarsFile from '../../../content/deen/scholars.json';
import worksFile from '../../../content/deen/works.json';
import reviewersFile from '../../../content/deen/reviewers.json';
import nawawi40Additions from '../../../content/deen/nawawi40/registry-additions.json';

interface Sidecar {
  collections?: CollectionEntry[];
  numberings?: NumberingEntry[];
  scholars?: ScholarEntry[];
  works?: WorkEntry[];
}

/**
 * Every package sidecar, by its path under content/deen. Add a new one here
 * (and its import above): registry-names.test.ts checks none is missing.
 */
export const SIDECARS: Record<string, Sidecar> = {
  'nawawi40/registry-additions.json': nawawi40Additions as Sidecar,
};

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

/** Shared entries first, then each sidecar's; the first definition of an id is kept */
function index<T extends { id: string }>(shared: T[], pick: (s: Sidecar) => T[] | undefined): Map<string, T> {
  const map = new Map<string, T>();
  for (const list of [shared, ...Object.values(SIDECARS).map((s) => pick(s) ?? [])]) {
    for (const e of list) if (e && typeof e.id === 'string' && !map.has(e.id)) map.set(e.id, e);
  }
  return map;
}

const collections = index((collectionsFile as { collections: CollectionEntry[] }).collections, (s) => s.collections);
const numberings = index((collectionsFile as { numberings: NumberingEntry[] }).numberings, (s) => s.numberings);
const scholars = index((scholarsFile as { scholars: ScholarEntry[] }).scholars, (s) => s.scholars);
const works = index((worksFile as { works: WorkEntry[] }).works, (s) => s.works);
const reviewers = new Map<string, ReviewerEntry>(
  (reviewersFile as unknown as ReviewerEntry[]).filter((r) => r && typeof r.id === 'string').map((r) => [r.id, r]),
);

/** "ibn-hajar" → "Ibn hajar": readable, never blank, for ids the app has no name for */
export function humanizeId(id: string): string {
  const s = id.replace(/[-_]+/g, ' ').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : id;
}

/** "ibn-rajab" → "Ibn Rajab", "al-nawawi" → "al-Nawawi": a person's id as a name */
export function humanizeName(id: string): string {
  const words = id.split(/[-_]+/).filter(Boolean);
  if (!words.length) return id;
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (w === 'al' && words[i + 1]) {
      out.push(`al-${words[i + 1][0].toUpperCase()}${words[i + 1].slice(1)}`);
      i++;
    } else if (i > 0 && (w === 'ibn' || w === 'bin' || w === 'bint')) out.push(w);
    else out.push(w[0].toUpperCase() + w.slice(1));
  }
  return out.join(' ');
}

export const collectionName = (id: string) => collections.get(id)?.name ?? humanizeId(id);
export const collectionInfo = (id: string) => collections.get(id);
export const scholarName = (id: string) => scholars.get(id)?.name ?? humanizeName(id);
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
