'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { MapPinIcon } from '@/components/ui/icons';
import { usePlaceStore } from '@/stores/place-store';
import { compassName, compassPoint, formatDistance } from '@/lib/mosques/geo';
import { loadPack, nearestMosques, OSM_ATTRIBUTION, PackError, type MosquePack, type NearMosque } from '@/lib/mosques/pack';
import { countryName, formatBytes, packInfo } from '@/lib/mosques/index-data';
import { mapsHref, mapsPlatform } from '@/lib/mosques/links';
import type { Place } from '@/types/prayer';

const PAGE = 20;
const MAX_SHOWN = 100;

// Kept for this app session: once a country's list is loaded, coming back to the
// screen shows it straight away. Nothing about it is stored on the device.
const loaded = new Map<string, MosquePack>();

const noop = () => () => {};
/** False during the static render, true once on the device (the place lives in localStorage) */
function useOnDevice(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

type LoadState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; kind: PackError['kind'] };

/**
 * Mosques near the user's place (all-in-one spec 2.2, 4): one country's list from
 * OpenStreetMap, sorted on the device by straight-line distance. The list loads
 * only when asked, the request names the country and nothing else, and no map
 * tiles are drawn (a tile request would give the position away).
 */
export default function MosqueFinder() {
  const onDevice = useOnDevice();
  const place = usePlaceStore((s) => s.place);

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-mosques>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/prayer" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Mosques</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-5">
        {!onDevice ? <SkeletonRows count={3} /> : !place ? <NeedPlace /> : <ForPlace key={place.countryCode} place={place} />}
      </main>

      <BottomNav />
    </div>
  );
}

function NeedPlace() {
  return (
    <Card className="px-5 py-7 text-center" >
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
        <MapPinIcon size={20} />
      </span>
      <p className="mt-3 font-semibold text-foreground">Set your place first</p>
      <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
        Mosques are listed by distance from the place you choose for prayer times. It stays on your phone.
      </p>
      <Link
        href="/prayer/setup"
        className="tactile-btn mt-5 inline-flex min-h-12 items-center justify-center rounded-xl bg-teal px-6 text-sm font-semibold text-on-teal"
        data-mosques-setup
      >
        Set your place
      </Link>
    </Card>
  );
}

function ForPlace({ place }: { place: Place }) {
  const cc = place.countryCode;
  const info = packInfo(cc);
  const country = countryName(cc);
  const [pack, setPack] = useState<MosquePack | null>(() => loaded.get(cc) ?? null);
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  if (!info) return <NoPack country={cc ? country : ''} />;

  const load = async () => {
    setState({ status: 'loading' });
    try {
      const p = await loadPack(cc);
      loaded.set(cc, p);
      setPack(p);
      setState({ status: 'idle' });
    } catch (err) {
      setState({ status: 'error', kind: err instanceof PackError ? err.kind : 'network' });
    }
  };

  if (pack) return <MosqueList pack={pack} place={place} country={country} />;
  if (state.status === 'error' && state.kind === 'missing') return <NoPack country={country} />;

  return (
    <>
      <Card className="px-5 py-6" data-mosques-confirm>
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Mosques near {place.label || country}</p>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          This loads the mosque list for {country}. Your position is not sent.
        </p>
        <p className="mt-1 text-xs text-muted">
          {info.count.toLocaleString('en')} mosques, {formatBytes(info.bytes)}. The nearest are worked out on your phone.
        </p>
        {state.status === 'error' && (
          <p className="mt-3 text-sm text-foreground" role="alert">
            {state.kind === 'invalid'
              ? `The list for ${country} couldn't be read. Try again later.`
              : "Couldn't load the list. If you're offline, try again once you're connected."}
          </p>
        )}
        <button
          type="button"
          onClick={load}
          disabled={state.status === 'loading'}
          className="tactile-btn mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal disabled:opacity-60"
          data-mosques-load
        >
          {state.status === 'loading' ? 'Loading…' : state.status === 'error' ? 'Try again' : 'Show mosques'}
        </button>
      </Card>
      {state.status === 'loading' && <SkeletonRows count={4} />}
      <Attribution />
    </>
  );
}

function NoPack({ country }: { country: string }) {
  return (
    <>
      <Card className="px-5 py-7 text-center" data-mosques-empty>
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
          <MapPinIcon size={20} />
        </span>
        <p className="mt-3 font-semibold text-foreground">{country ? `No mosque list for ${country} yet` : 'No mosque list for this place yet'}</p>
        <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
          Lists are built from OpenStreetMap one country at a time, and this one isn&apos;t in the app yet.
        </p>
      </Card>
      <Attribution />
    </>
  );
}

function MosqueList({ pack, place, country }: { pack: MosquePack; place: Place; country: string }) {
  const [shown, setShown] = useState(PAGE);
  const near = useMemo(() => nearestMosques(pack, place, MAX_SHOWN), [pack, place]);
  const platform = useMemo(() => mapsPlatform(), []);
  const list = near.slice(0, shown);

  return (
    <>
      <div className="px-1">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Nearest to {place.label || country}</p>
        <p className="mt-0.5 text-xs text-muted">Straight-line distance and direction from your place.</p>
      </div>
      <Card className="p-0" >
        <ul className="divide-y divide-foreground/10" data-mosques-list>
          {list.map((m, i) => (
            <MosqueRow key={`${m.lat},${m.lng},${i}`} m={m} cc={place.countryCode} href={mapsHref(m, platform)} />
          ))}
        </ul>
      </Card>
      {shown < near.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="min-h-11 w-full rounded-xl text-sm font-semibold text-teal hover:bg-foreground/5"
          data-mosques-more
        >
          Show more
        </button>
      )}
      <p className="px-1 text-xs leading-relaxed text-muted">
        Names and places are mapped by volunteers and can be out of date. Only mosques in {country} are listed.
      </p>
      <Attribution date={pack.date} />
    </>
  );
}

function MosqueRow({ m, cc, href }: { m: NearMosque; cc: string; href: string }) {
  const point = compassPoint(m.bearing);
  const distance = formatDistance(m.distanceKm, cc);
  // The English name, if the map has one, under a name in another script
  const sub = m.nameEn && m.nameEn !== m.name ? m.nameEn : '';
  return (
    <li className="flex items-center gap-3 px-4 py-3" data-mosque>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
          {m.name || m.nameEn || <span className="font-normal text-muted">Unnamed mosque</span>}
        </p>
        {sub && <p className="text-xs text-muted [overflow-wrap:anywhere]">{sub}</p>}
        {m.nameAr && (
          <p className="arabic-text mt-0.5 text-base leading-snug text-foreground/80" dir="rtl" lang="ar">
            {m.nameAr}
          </p>
        )}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted" aria-label={`${distance} ${compassName(point)}`} data-mosque-distance>
          <BearingArrow deg={m.bearing} />
          <span aria-hidden>
            {distance} · {point}
          </span>
        </p>
      </div>
      <a
        href={href}
        className="flex min-h-11 shrink-0 items-center rounded-xl border border-teal/30 px-3 text-xs font-semibold text-teal hover:bg-teal/5"
        aria-label={`Open ${m.name || 'this mosque'} in Maps`}
        data-mosque-maps
      >
        Open in Maps
      </a>
    </li>
  );
}

/** A small arrow pointing the way from the place (north is up, as on a map) */
function BearingArrow({ deg }: { deg: number }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden className="shrink-0 text-teal" style={{ transform: `rotate(${Math.round(deg)}deg)` }}>
      <path d="M12 3 L18 19 L12 15 L6 19 Z" fill="currentColor" />
    </svg>
  );
}

function Attribution({ date }: { date?: string }) {
  return (
    <p className="px-1 pt-1 text-xs text-muted" data-mosques-attribution>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {OSM_ATTRIBUTION}
      </a>
      {date ? `. Map data from ${date}.` : ''}
    </p>
  );
}
