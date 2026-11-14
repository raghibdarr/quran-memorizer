'use client';

import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { MapPinIcon, XIcon } from '@/components/ui/icons';
import { deviceTimeZone, getCoarseLocation, type LocationResult } from '@/lib/location';
import {
  countryName,
  loadCities,
  nearestCity,
  placeFromCity,
  placeFromFix,
  regionName,
  searchCities,
  type City,
  type CityIndex,
} from '@/lib/prayer/cities';
import type { Place } from '@/types/prayer';

type Mode = 'choose' | 'locating' | 'search';
type Failure = Exclude<LocationResult, { ok: true }>['reason'];

const FAILED: Record<Failure, string> = {
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

const TILE =
  'pressable flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl border-[1.5px] border-foreground/15 bg-card px-3 py-3 text-sm font-semibold text-foreground disabled:opacity-60';

/** Scrolls an element up to just under the screen's sticky header (room for the results above the keyboard) */
function scrollUnderHeader(el: HTMLElement) {
  let headerBottom = 0;
  document.querySelectorAll<HTMLElement>('.sticky').forEach((h) => {
    const r = h.getBoundingClientRect();
    if (r.top <= 1 + parseFloat(getComputedStyle(h).top || '0')) headerBottom = Math.max(headerBottom, r.bottom);
  });
  const top = el.getBoundingClientRect().top + window.scrollY - headerBottom - 8;
  if (top > window.scrollY) window.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

/**
 * Where are you: "Use my location" and "Choose a city", side by side and equal.
 * Once the search is open the two give way to one line ("Use my location
 * instead") so the field and its results sit high, above the keyboard.
 * Location is asked for only on that tap (one coarse fix, rounded); a refusal
 * goes straight to the city search, which needs no permission at all. The
 * city list loads only here, from the app's own files.
 */
export default function PlacePicker({ onPick, autoSearch = false }: { onPick: (place: Place) => void; autoSearch?: boolean }) {
  const [mode, setMode] = useState<Mode>(autoSearch ? 'search' : 'choose');
  const [note, setNote] = useState<string | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

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
    setFailure(null);
    setMode('locating');
    const fix = await getCoarseLocation();
    if (mine !== request.current) return;
    if (!fix.ok) {
      setNote(FAILED[fix.reason]);
      setFailure(fix.reason);
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

  const searching = mode === 'search';
  return (
    <div className="space-y-3" data-place-picker>
      {searching ? (
        // Location off for Takrar: asking again would only fail again, so the line is left out
        failure !== 'denied' && (
          <button type="button" onClick={locate} className="-my-1 flex min-h-11 items-center gap-2 px-1 text-sm font-semibold text-teal" data-use-location>
            <MapPinIcon size={16} className="shrink-0" />
            Use my location instead
          </button>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={locate} disabled={mode === 'locating'} className={TILE}>
            <MapPinIcon size={20} className="text-teal" />
            {mode === 'locating' ? 'Finding you…' : 'Use my location'}
          </button>
          <button
            type="button"
            onClick={() => {
              request.current++;
              setNote(null);
              setFailure(null);
              setMode('search');
            }}
            className={TILE}
          >
            <SearchIcon size={20} className="text-teal" />
            Choose a city
          </button>
        </div>
      )}
      {note && (
        <p className="px-1 text-sm text-muted" role="status">
          {note}
        </p>
      )}
      {searching && <CitySearch onPick={(city, index) => onPick(placeFromCity(city, index))} />}
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

  // Focus, and bring the field up under the header: with the keyboard open there is room for the results
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    // The whole picker, so a note above the field ("Location is off…") stays in view too
    const id = requestAnimationFrame(() => {
      const el = rootRef.current;
      if (el) scrollUnderHeader(el.closest<HTMLElement>('[data-place-picker]') ?? el);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  const results = index && deferred.trim() ? searchCities(index, deferred, 8) : [];
  // Same name, same country and no state to tell them apart (rare outside the US): by position
  const twins = new Set(
    results.filter((c, i) => !c.admin1 && results.some((d, j) => j !== i && d.name === c.name && d.cc === c.cc)).map((c) => c.id),
  );

  return (
    // The height keeps room below the field, so it can scroll up above the keyboard on a short screen
    <div ref={rootRef} className="min-h-[70dvh] space-y-2" data-city-search>
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
          className="min-h-12 w-full rounded-xl border-[1.5px] border-foreground/15 bg-card py-3 pl-10 pr-11 text-base text-foreground placeholder:text-muted focus:border-teal focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear"
            onClick={() => {
              setQuery('');
              inputRef.current?.focus();
            }}
            className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted hover:bg-foreground/5"
          >
            <XIcon size={16} />
          </button>
        )}
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
                    {regionName(c) ? `${regionName(c)} · ${countryName(c.cc)}` : countryName(c.cc)}
                    {twins.has(c.id) && ` · ${coordText(c.lat, c.lng)}`}
                  </span>
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
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
