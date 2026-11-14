'use client';

import { lazy, Suspense, useState } from 'react';

// Keys of src/stores/place-store.ts and prayer-store.ts. Read raw here so Home's
// first load carries neither store (scripts/check-bundle.mjs budget).
const PLACE_KEY = 'takrar-place';
const PRAYER_KEY = 'takrar-prayer';

const PrayerStripLive = lazy(() => import('@/components/prayer/times/strip-live'));

/** Whether the strip has anything to show: a saved place, and the strip not turned off */
export function stripWanted(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    const place = JSON.parse(storage.getItem(PLACE_KEY) ?? 'null')?.state?.place;
    if (!place || typeof place !== 'object') return false;
    const prayer = JSON.parse(storage.getItem(PRAYER_KEY) ?? 'null')?.state;
    return prayer?.homeStrip !== false;
  } catch {
    return false;
  }
}

/**
 * The one slim line Home gains (all-in-one spec 2.3): "Asr 15:12 · in 1 h 4 min",
 * or "Iftar 16:31 · in 2 h" in Ramadan. Nothing at all until a place is set or
 * when the user turned it off. Only then are the stores and the engine loaded
 * (by dynamic import), so Home's first load is unchanged for everyone else.
 */
export function HomePrayerStrip() {
  // The app renders on the client only (Providers waits for mount); Home remounts
  // on every visit, so a place set elsewhere shows up on the way back
  const [wanted] = useState(() => {
    try {
      return typeof window !== 'undefined' && stripWanted(window.localStorage);
    } catch {
      return false; // storage blocked: no place could have been saved either
    }
  });
  if (!wanted) return null;
  return (
    <Suspense fallback={<div className="mt-3 min-h-11 rounded-xl border border-foreground/10 bg-card" aria-hidden />}>
      <PrayerStripLive />
    </Suspense>
  );
}

export default HomePrayerStrip;
