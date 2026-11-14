'use client';

// Where the course screens get their units and evidence from: the deen
// engine's deck source (registry decks that are ready, plus the end-to-end test
// seam), never a fetch. A course deck with `ready: false` simply isn't there.

import { useEffect, useState } from 'react';
import { getDeck, getItem, liveDecks } from '@/components/deen/deck-source';
import { useGlossary } from '@/components/deen/term';
import { plainText } from '@/lib/deen/glossary';
import { unitFrom, type CourseUnit } from '@/lib/course/progress';
import { evidenceHostDeck, parseItemRef } from '@/lib/course/lesson';
import type { EmittedDeck, GlossaryTerm, TextItem } from '@/types/deen';

const EMPTY_TERMS: ReadonlyMap<string, GlossaryTerm> = new Map();

export async function loadCourseUnits(): Promise<CourseUnit[]> {
  const decks = (await liveDecks()).filter((d) => d.kind === 'course');
  const units = await Promise.all(decks.map(async (d) => unitFrom(d, await getDeck(d.id).catch(() => null))));
  return units.filter((u): u is CourseUnit => u !== null);
}

/** The live course units in registry order; null while loading */
export function useCourseUnits(): CourseUnit[] | null {
  const [units, setUnits] = useState<CourseUnit[] | null>(null);
  useEffect(() => {
    let live = true;
    loadCourseUnits()
      .then((u) => live && setUnits(u))
      .catch(() => live && setUnits([]));
    return () => {
      live = false;
    };
  }, []);
  return units;
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
