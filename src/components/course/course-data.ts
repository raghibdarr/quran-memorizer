'use client';

// Where the course screens get their units and evidence from: the deen
// engine's deck source (registry decks that are ready, plus the end-to-end test
// seam), never a fetch. A course deck with `ready: false` simply isn't there.

import { useEffect, useState } from 'react';
import { DECKS, getDeck, getItem, liveDecks } from '@/components/deen/deck-source';
import { loadDeckModule } from '@/lib/deen/load';
import { useGlossary } from '@/components/deen/term';
import { plainText } from '@/lib/deen/glossary';
import { unitFrom, type CourseUnit } from '@/lib/course/progress';
import { evidenceHostDeck, parseItemRef } from '@/lib/course/lesson';
import type { EmittedDeck, GlossaryTerm, TextItem } from '@/types/deen';

const EMPTY_TERMS: ReadonlyMap<string, GlossaryTerm> = new Map();

/** A course deck the registry ships that couldn't be loaded (a chunk that failed on a bad connection or after a deploy) */
export class CourseLoadError extends Error {
  constructor() {
    super('The course lessons could not be loaded');
    this.name = 'CourseLoadError';
  }
}

/**
 * The live course units in registry order. Throws CourseLoadError when a course
 * deck the registry has couldn't be loaded, so a failed download never reads as
 * "coming soon" or "this lesson isn't available".
 */
export async function loadCourseUnits(): Promise<CourseUnit[]> {
  const live = (await liveDecks()).filter((d) => d.kind === 'course');
  // A registry course deck whose module didn't load is missing from `live`, not "not ready"
  const registry = DECKS.filter((d) => d.kind === 'course' && !live.some((l) => l.id === d.id));
  const unloaded = await Promise.all(registry.map(async (d) => (await loadDeckModule(d.id)) === null));
  if (unloaded.some(Boolean)) throw new CourseLoadError();
  const decks = await Promise.all(live.map(async (d) => [d, await getDeck(d.id).catch(() => null)] as const));
  // A live deck is one whose package says it is ready: no content means the download failed
  if (decks.some(([, deck]) => deck === null)) throw new CourseLoadError();
  return decks.map(([d, deck]) => unitFrom(d, deck)).filter((u): u is CourseUnit => u !== null);
}

export type CourseUnitsState = { units: CourseUnit[] | null; failed: boolean };

/** The live course units (null while loading), and whether loading failed */
export function useCourseUnits(): CourseUnitsState {
  const [state, setState] = useState<CourseUnitsState>({ units: null, failed: false });
  useEffect(() => {
    let live = true;
    loadCourseUnits()
      .then((units) => live && setState({ units, failed: false }))
      .catch(() => live && setState({ units: null, failed: true }));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/**
 * Try again after a failed load. The deck loader keeps a failed download as
 * "nothing" for the rest of the page's life, so a fresh load is the only retry
 * that reaches the network again; it also picks up a new deploy's files.
 */
export function retryCourseLoad() {
  window.location.reload();
}

const shippable = (item: TextItem | undefined | null): TextItem | null =>
  item && item.review?.status && item.review.status !== 'draft' ? item : null;

/**
 * The text behind an `{ item: "<deck>:<itemId>" }` evidence ref: a live corpus
 * item (a hadith deck), or a hadith the course unit keeps under
 * `<deck>-evidence`, which the build places beside the lessons as `evidence`.
 * Null when it isn't in the app (yet); never a guess.
 */
export async function resolveEvidenceItem(ref: string): Promise<TextItem | null> {
  const p = parseItemRef(ref);
  if (!p) return null;
  const direct = await getItem<TextItem>(p.deck, p.itemId).catch(() => null);
  if (direct && 'citations' in direct) return shippable(direct);
  const host = evidenceHostDeck(p.deck);
  if (!host) return null;
  const deck = (await getDeck(host).catch(() => null)) as (EmittedDeck & { evidence?: TextItem[] }) | null;
  return shippable(deck?.evidence?.find((i) => i.id === p.itemId));
}

/** Authored text with [[term]] marks as plain words (for titles, links and buttons, where a tappable term can't sit) */
export function usePlainText(): (text: string) => string {
  const terms = useGlossary();
  return (text: string) => plainText(text, terms ?? EMPTY_TERMS);
}
