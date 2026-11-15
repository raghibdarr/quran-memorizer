'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import { SkeletonRows } from '@/components/ui/skeleton';
import { MapPinIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import { usePlaceStore } from '@/stores/place-store';
import { compassName, compassPoint, distanceLine } from '@/lib/mosques/geo';
import { loadPack, nearestMosques, OSM_ATTRIBUTION, PackError, type MosquePack, type NearMosque } from '@/lib/mosques/pack';
import { countryName, formatBytes, packInfo } from '@/lib/mosques/index-data';
import { mapsHref, mapsPlatform, opensInNewTab, type MapsPlatform } from '@/lib/mosques/links';
import { fitsAppArabicFace, isArabicScript } from '@/lib/mosques/script';
import type { Place } from '@/types/prayer';

const PAGE = 20;
const MAX_SHOWN = 100;
/** Lists smaller than this load as soon as the screen opens; bigger ones (Türkiye, Iran, Bangladesh) ask first */
const AUTO_LOAD_BYTES = 500_000;

// Kept for this app session: once a country's list is loaded, coming back to the
// screen shows it straight away. Nothing about it is stored on the device.
const loaded = new Map<string, MosquePack>();

const noop = () => () => {};
/** False during the static render, true once on the device (the place lives in localStorage) */
function useOnDevice(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}

/** In the native apps every list is inside the app bundle, so loading one costs nothing */
function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

type LoadState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; kind: PackError['kind'] };

/**
 * Mosques near the user's place (all-in-one spec 2.2, 4): one country's list from
 * OpenStreetMap, sorted on the device by straight-line distance. The request names
 * the country and nothing else; small lists load when the screen opens, big ones
 * only when asked. No map tiles are drawn (a tile request would give the place away).
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

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        {!onDevice ? <SkeletonRows count={3} /> : !place ? <NeedPlace /> : <ForPlace key={place.countryCode} place={place} />}
      </main>

      <BottomNav />
    </div>
  );
}

const primaryBtn =
  'tactile-btn mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-teal text-sm font-semibold text-on-teal disabled:opacity-60';
const quietBtn =
  'mt-5 flex min-h-12 w-full items-center justify-center rounded-xl border border-foreground/10 text-sm font-semibold text-teal transition-colors hover:bg-foreground/[0.03] active:bg-foreground/5';

/** The one card layout every non-list state of the screen uses */
function StateCard({ title, children, action, ...data }: { title: string; children: ReactNode; action?: ReactNode } & Record<`data-${string}`, boolean>) {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-card px-5 py-7 text-center" {...data}>
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
        <MapPinIcon size={20} />
      </span>
      <p className="mt-3 font-semibold text-balance text-foreground">{title}</p>
      <div className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-balance text-muted">{children}</div>
      {action}
    </div>
  );
}

function NeedPlace() {
  return (
    <StateCard
      title="Set your place first"
      action={
        <Link href="/prayer/setup" className={primaryBtn} data-mosques-setup>
          Set your place
        </Link>
      }
    >
      Mosques are listed by distance from the place you choose for prayer times. Your location stays on your phone.
    </StateCard>
  );
}

function ForPlace({ place }: { place: Place }) {
  const cc = place.countryCode;
  const info = packInfo(cc);
  const country = countryName(cc);
  const auto = !!info && (info.bytes < AUTO_LOAD_BYTES || isNativeApp());
  const [pack, setPack] = useState<MosquePack | null>(() => loaded.get(cc) ?? null);
  const [state, setState] = useState<LoadState>(() => (auto && !loaded.has(cc) ? { status: 'loading' } : { status: 'idle' }));
  const started = useRef(false);

  const fetchPack = () =>
    loadPack(cc).then(
      (p) => {
        loaded.set(cc, p);
        setPack(p);
        setState({ status: 'idle' });
      },
      (err) => setState({ status: 'error', kind: err instanceof PackError ? err.kind : 'network' }),
    );

  // A small list loads as the screen opens (once, even under StrictMode's double effect)
  useEffect(() => {
    if (state.status !== 'loading' || started.current) return;
    started.current = true;
    void fetchPack();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the initial auto load
  }, []);

  if (!cc) return <NoCountry />;
  if (!info) return <NoPack country={country} />;
  if (pack) return <MosqueList pack={pack} place={place} country={country} />;
  if (state.status === 'error' && state.kind === 'missing') return <NoPack country={country} />;

  const load = () => {
    setState({ status: 'loading' });
    void fetchPack();
  };

  const near = place.label || country;

  // A small list loading on its own: just the shape of the list to come
  if (auto && state.status === 'loading') {
    return (
      <div className="space-y-3" role="status" aria-busy="true" data-mosques-loading>
        <span className="sr-only">Loading mosques</span>
        <p className="px-1 text-[11px] font-bold uppercase tracking-wider text-teal">Nearest to {near}</p>
        <SkeletonRows count={4} />
      </div>
    );
  }

  return (
    <>
      <StateCard
        title={`Mosques near ${near}`}
        data-mosques-confirm
        action={
          <button type="button" onClick={load} disabled={state.status === 'loading'} className={primaryBtn} data-mosques-load>
            {state.status === 'loading' ? 'Loading…' : state.status === 'error' ? 'Try again' : 'Show mosques'}
          </button>
        }
      >
        {state.status === 'error' ? (
          <p role="alert">
            {state.kind === 'invalid'
              ? `The list for ${country} couldn't be read. Try again later.`
              : "Couldn't load the list. If you're offline, try again once you're connected."}
          </p>
        ) : (
          <p>
            We&apos;ll download the list for {country} ({formatBytes(info.bytes)}) and find the nearest on your phone. Your location
            isn&apos;t sent.
          </p>
        )}
      </StateCard>
      {state.status === 'loading' && <SkeletonRows count={4} />}
      <Attribution />
    </>
  );
}

/** A place with no country code (possible for a GPS place): the list may well exist */
function NoCountry() {
  return (
    <StateCard
      title="We couldn't tell which country you're in"
      data-mosques-nocountry
      action={
        <Link href="/prayer/setup" className={primaryBtn} data-mosques-setup>
          Choose a city
        </Link>
      }
    >
      Pick your city and we&apos;ll show mosques near it.
    </StateCard>
  );
}

function NoPack({ country }: { country: string }) {
  return (
    <>
      <StateCard
        title={`We don't have a mosque list for ${country} yet`}
        data-mosques-empty
        action={
          <Link href="/prayer/settings" className={quietBtn} data-mosques-change>
            Change place
          </Link>
        }
      >
        Lists come from OpenStreetMap, one country at a time. If your place is wrong, you can change it.
      </StateCard>
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
        <p className="mt-1 text-xs leading-relaxed text-muted">Straight-line distance. Tap a mosque to open it in Maps.</p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-foreground/10 bg-card">
        <ul className="divide-y divide-foreground/10" data-mosques-list>
          {list.map((m, i) => (
            <MosqueRow key={`${m.lat},${m.lng},${i}`} m={m} cc={place.countryCode} platform={platform} />
          ))}
        </ul>
      </div>
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
        Your place is kept to about a kilometre, so the nearest ones are approximate. Names and places are mapped by volunteers and can
        be out of date. Only mosques in {country} are listed.
      </p>
      <Attribution date={pack.date} />
    </>
  );
}

/** A name line in Arabic script: the app's Arabic face when it has every letter, the device's otherwise */
function arabicName(name: string, size: 'primary' | 'secondary') {
  const brand = fitsAppArabicFace(name);
  return cn(
    'text-left [overflow-wrap:anywhere]',
    brand ? 'font-[family-name:var(--font-arabic)]' : 'font-normal',
    size === 'primary' ? 'text-lg leading-[1.6] text-foreground' : 'mt-0.5 text-[17px] leading-[1.5] text-muted',
    !brand && size === 'primary' && 'text-[17px]',
  );
}

function MosqueRow({ m, cc, platform }: { m: NearMosque; cc: string; platform: MapsPlatform }) {
  const dist = distanceLine(m.distanceKm, cc);
  const point = compassPoint(m.bearing);
  const name = m.name || m.nameEn;
  // The English name, if the map has one, under a name in another script
  const sub = m.nameEn && m.nameEn !== name ? m.nameEn : '';
  const newTab = opensInNewTab(platform);
  return (
    <li data-mosque>
      <a
        href={mapsHref(m, platform)}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03] active:bg-foreground/5 focus-visible:bg-foreground/[0.03]"
        data-mosque-maps
      >
        <div className="min-w-0 flex-1">
          {!name ? (
            <p className="text-base leading-snug text-muted">Unnamed mosque</p>
          ) : isArabicScript(name) ? (
            <p className={arabicName(name, 'primary')} dir="rtl" lang="ar">
              {name}
            </p>
          ) : (
            <p className="text-base font-semibold leading-snug text-foreground [overflow-wrap:anywhere]" dir="auto">
              {name}
            </p>
          )}
          {sub && (
            <p className="mt-0.5 text-left text-[13px] text-muted [overflow-wrap:anywhere]" dir="auto">
              {sub}
            </p>
          )}
          {m.nameAr && m.nameAr !== name && (
            <p className={arabicName(m.nameAr, 'secondary')} dir="rtl" lang="ar">
              {m.nameAr}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium tabular-nums text-muted" data-mosque-distance>
            {!dist.near && <BearingArrow deg={m.bearing} />}
            <span aria-hidden>{dist.near ? dist.text : `${dist.text} · ${point}`}</span>
            {/* Real text, not aria-label, so it is read with the name */}
            <span className="sr-only">{dist.near ? dist.spoken : `${dist.spoken} ${compassName(point)}`}. Open in Maps</span>
          </p>
        </div>
        <ExternalIcon />
      </a>
    </li>
  );
}

/** Leaves the app (a maps app or a new tab), so an arrow out of a box rather than a chevron; a plain arrow would read as a direction */
function ExternalIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-muted"
    >
      <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </svg>
  );
}

/** The way from the place, north up as on a map: a stroked arrow in a fixed round marker */
function BearingArrow({ deg }: { deg: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal/10" aria-hidden>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.25}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-teal"
        style={{ transform: `rotate(${Math.round(deg)}deg)`, transformOrigin: '50% 50%' }}
      >
        <path d="M12 20V4M6 10l6-6 6 6" />
      </svg>
    </span>
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
