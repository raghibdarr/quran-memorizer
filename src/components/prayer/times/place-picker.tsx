'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { MapPinIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { deviceTimeZone, getCoarseLocation, type LocationResult } from '@/lib/location';
import {
  countryName,
  loadCities,
  nearestCity,
  placeFromCity,
  placeFromFix,
  searchCities,
  type City,
  type CityIndex,
} from '@/lib/prayer/cities';
import type { Place } from '@/types/prayer';

type Mode = 'choose' | 'locating' | 'search';

const FAILED: Record<Exclude<LocationResult, { ok: true }>['reason'], string> = {
  denied: 'Location is off for Takrar, so choose your city instead.',
  timeout: 'Your phone couldn’t find a location in time. Choose your city instead.',
  unavailable: 'Your phone couldn’t find a location. Choose your city instead.',
  unsupported: 'This browser can’t share a location. Choose your city instead.',
};

function SearchIcon({ size = 18, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
  );
}

/**
 * Where are you: "Use my location" and "Choose a city", side by side and equal.
 * Location is asked for only on that tap (one coarse fix, rounded); a refusal
 * goes straight to the city search, which needs no permission at all. The
 * city list loads only here, from the app's own files.
 */
export default function PlacePicker({ onPick, autoSearch = false }: { onPick: (place: Place) => void; autoSearch?: boolean }) {
  const [mode, setMode] = useState<Mode>(autoSearch ? 'search' : 'choose');
  const [note, setNote] = useState<string | null>(null);

  // Bumped whenever the user moves on (taps "Choose a city", asks again, leaves the
  // screen): a fix that arrives after that is dropped instead of replacing their choice
  const request = useRef(0);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  const locate = async () => {
    const mine = ++request.current;
    setNote(null);
    setMode('locating');
    const fix = await getCoarseLocation();
    if (mine !== request.current) return;
    if (!fix.ok) {
      setNote(FAILED[fix.reason]);
      setMode('search');
      return;
    }
    // The label and zone come from the nearest bundled city, worked out here
    let index: CityIndex | null = null;
    try {
      index = await loadCities();
    } catch {
      index = null;
    }
    if (mine !== request.current) return;
    const near = index ? nearestCity(index, fix.lat, fix.lng) : null;
    onPick(placeFromFix(fix.lat, fix.lng, near, deviceTimeZone(), index));
  };

  return (
    <div className="space-y-3" data-place-picker>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={locate}
          disabled={mode === 'locating'}
          className={cn(
            'pressable flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] px-3 py-3 text-sm font-semibold',
            'border-teal/30 bg-teal/5 text-teal disabled:opacity-60',
          )}
        >
          <MapPinIcon size={20} />
          {mode === 'locating' ? 'Finding you…' : 'Use my location'}
        </button>
        <button
          type="button"
          onClick={() => {
            request.current++;
            setNote(null);
            setMode('search');
          }}
          aria-pressed={mode === 'search'}
          className={cn(
            'pressable flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] px-3 py-3 text-sm font-semibold',
            'border-teal/30 bg-teal/5 text-teal',
          )}
        >
          <SearchIcon size={20} />
          Choose a city
        </button>
      </div>
      {note && (
        <p className="px-1 text-sm text-muted" role="status">
          {note}
        </p>
      )}
      {mode === 'search' && <CitySearch onPick={(city, index) => onPick(placeFromCity(city, index))} />}
    </div>
  );
}

/** 39.80° N, 89.64° W */
const coordText = (lat: number, lng: number) =>
  `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lng).toFixed(2)}° ${lng >= 0 ? 'E' : 'W'}`;

/** Offline search over the bundled city list */
export function CitySearch({ onPick }: { onPick: (city: City, index: CityIndex) => void }) {
  const [index, setIndex] = useState<CityIndex | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    loadCities()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [attempt]);

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  const results = index && deferred.trim() ? searchCities(index, deferred, 8) : [];
  // Same name, same country (three Springfields): tell them apart by position
  const twins = new Set(results.filter((c, i) => results.some((d, j) => j !== i && d.name === c.name && d.cc === c.cc)).map((c) => c.id));

  return (
    <div className="space-y-2" data-city-search>
      <label className="sr-only" htmlFor="city-search">
        City
      </label>
      <div className="relative">
        <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          id="city-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Search for your city"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-xl border-[1.5px] border-foreground/15 bg-card py-3 pl-10 pr-3 text-base text-foreground placeholder:text-muted focus:border-teal focus:outline-none"
        />
      </div>

      {failed && !index ? (
        <p className="px-1 text-sm text-muted">
          The city list didn’t load. Check your connection, then{' '}
          <button
            type="button"
            className="font-semibold text-teal underline underline-offset-2"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
          >
            try again
          </button>
          .
        </p>
      ) : !index ? (
        <p className="px-1 text-sm text-muted" role="status">
          Loading cities…
        </p>
      ) : deferred.trim() && results.length === 0 ? (
        <p className="px-1 text-sm text-muted" role="status">
          No city by that name. Try the nearest larger town.
        </p>
      ) : results.length > 0 ? (
        <ul className="overflow-hidden rounded-2xl border border-foreground/10 bg-card" role="list">
          {results.map((c) => (
            <li key={c.id} className="border-b border-foreground/5 last:border-b-0">
              <button
                type="button"
                onClick={() => onPick(c, index)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-foreground/[0.03]"
                data-city={`${c.name}/${c.cc}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-foreground">{c.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {countryName(c.cc)}
                    {twins.has(c.id) && ` · ${coordText(c.lat, c.lng)}`}
                  </span>
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="px-1 text-[11px] leading-4 text-muted">City names and positions: GeoNames, CC BY 4.0.</p>
    </div>
  );
}
