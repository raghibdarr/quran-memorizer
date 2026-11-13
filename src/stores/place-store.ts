'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Place } from '@/types/prayer';
import { roundCoord } from '@/lib/location';

// Where the user is, for prayer times, qibla and mosques. DEVICE-ONLY by design
// (all-in-one spec 1.3): never synced, never in a backup file, never in a URL or
// any request. Coordinates are rounded to 2 decimal places (about 1 km) on the
// way in, whatever the caller passes.

export const PLACE_STORE_KEY = 'takrar-place';
export const PLACE_STORE_VERSION = 1;

interface PlaceState {
  place: Place | null;
  setPlace: (place: Place) => void;
  clearPlace: () => void;
}

/** A zone name this device can format in: every prayer time is shown through it, and Intl throws on an unknown one */
function isTimeZone(tz: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Validates and rounds a place; null when it can't be used */
export function sanitizePlace(raw: unknown): Place | null {
  const p = raw as Partial<Place> | null;
  if (!p || typeof p !== 'object') return null;
  if (typeof p.lat !== 'number' || typeof p.lng !== 'number' || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
  if (Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180) return null;
  if (typeof p.tz !== 'string' || !isTimeZone(p.tz)) return null;
  return {
    lat: roundCoord(p.lat),
    lng: roundCoord(p.lng),
    label: typeof p.label === 'string' ? p.label : '',
    countryCode: typeof p.countryCode === 'string' ? p.countryCode.toUpperCase() : '',
    tz: p.tz,
    source: p.source === 'gps' ? 'gps' : 'city',
  };
}

export function migratePlace(persisted: unknown, version: number): { place: Place | null } {
  const state = (persisted ?? {}) as { place?: unknown };
  void version; // v1 is the first version: anything older is unknown, sanitize it
  return { place: sanitizePlace(state.place) };
}

export const usePlaceStore = create<PlaceState>()(
  persist(
    (set) => ({
      place: null,
      setPlace: (place) => set({ place: sanitizePlace(place) }),
      clearPlace: () => set({ place: null }),
    }),
    {
      name: PLACE_STORE_KEY,
      version: PLACE_STORE_VERSION,
      migrate: (p, v) => migratePlace(p, v) as never,
      partialize: (s) => ({ place: s.place }),
    },
  ),
);
