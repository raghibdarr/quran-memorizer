'use client';

import { useState } from 'react';
import Link from '@/components/app-link';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import Card from '@/components/ui/card';
import { MapPinIcon, PrayerIcon, XIcon } from '@/components/ui/icons';
import PrayerToolTiles from '@/components/prayer/tool-tiles';
import HijriLine from '@/components/prayer/slots/hijri-line';
import RamadanBanner from '@/components/prayer/slots/ramadan-banner';
import RowTracker from '@/components/prayer/slots/row-tracker';
import AdhkarNow from '@/components/prayer/slots/adhkar-now';
import { cn } from '@/lib/cn';
import { deviceTimeZone } from '@/lib/location';
import { usePrayerStore } from '@/stores/prayer-store';
import { TIME_LABELS, type PrayerName } from '@/types/prayer';
import type { HubModel } from './model';
import { prefers12h, useModelSettings, useNow, usePlace, usePrayerModule } from './use-prayer-model';

/** Remembers, on this device only, which phone time zone the user waved away the "Update location?" line for */
const TZ_DISMISS_KEY = 'takrar-prayer-tz-dismissed';

function readDismissed(): string {
  try {
    return localStorage.getItem(TZ_DISMISS_KEY) ?? '';
  } catch {
    return '';
  }
}

function Header({ subtitle }: { subtitle?: React.ReactNode }) {
  return (
    <header className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground">Prayer</h1>
          <div className="flex shrink-0 items-center gap-2">
            <SettingsPanel />
            <UserButton />
          </div>
        </div>
        {/* Its own full-width line, so a long place name fits */}
        {subtitle}
      </div>
    </header>
  );
}

/** Before a place is set: one card, one action */
function SetupCard() {
  return (
    <Card className="px-5 py-6">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal/10 text-teal">
        <PrayerIcon size={22} />
      </div>
      <h2 className="mt-3 text-lg font-bold text-foreground">Prayer times, worked out on your phone</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted">Your location is never sent anywhere. Choose a city, or let your phone find it.</p>
      <Link href="/prayer/setup" className="tactile-btn mt-4 block rounded-xl bg-teal px-6 py-3 text-center font-semibold text-on-teal hover:bg-teal-light">
        Set up prayer times
      </Link>
    </Card>
  );
}

/** The next prayer, its time and how long until it: the one tactile thing on the screen */
function NextHero({ model, format, now, until }: { model: HubModel; format: (ms: number) => string; now: number; until: (ms: number, now: number) => string }) {
  const next = model.next;
  if (!next) {
    return (
      <Card variant="tactile" className="p-5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal">Next prayer</p>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground">
          The sun doesn’t give a time for the next prayer here in the coming days. Choose a high-latitude rule in{' '}
          <Link href="/prayer/settings" className="font-semibold text-teal underline underline-offset-2">
            prayer settings
          </Link>
          .
        </p>
      </Card>
    );
  }
  const label = model.ramadan && next.prayer === 'maghrib' ? 'Maghrib (iftar)' : TIME_LABELS[next.prayer];
  return (
    <Card variant="tactile" className="p-5">
      <div data-next-hero={next.prayer}>
        <p className="text-[11px] font-bold uppercase tracking-wider text-teal">{model.nextIsTomorrow ? 'Next prayer, tomorrow' : 'Next prayer'}</p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="text-3xl font-bold text-foreground">{label}</p>
          <p className="text-3xl font-bold tabular-nums text-teal">{format(next.at)}</p>
        </div>
        <p className="mt-1 text-sm text-muted" data-countdown>
          {until(next.at, now)}
        </p>
      </div>
    </Card>
  );
}

function TimesList({ model, format }: { model: HubModel; format: (ms: number) => string }) {
  return (
    <section className="space-y-2">
      {/* After Isha the hero shows tomorrow's Fajr: this says the list is still today's */}
      {model.nextIsTomorrow && (
        <h2 className="px-1 text-[11px] font-bold uppercase tracking-wider text-muted" data-times-day>
          Today
        </h2>
      )}
      <ul className="group/times divide-y divide-foreground/5 overflow-hidden rounded-2xl border border-foreground/10 bg-card" aria-label="Today’s prayer times">
        {model.rows.map((r) => {
          const isPrayer = r.name !== 'sunrise';
          // Passed times and sunrise in the muted colour, so the day reads: passed, now, next, later
          const tone = r.isNext ? 'text-teal' : r.isPassed || !isPrayer ? 'text-muted' : 'text-foreground';
          const weight = isPrayer && !r.isPassed ? 'font-semibold' : 'font-medium';
          return (
            <li
              key={r.name}
              data-prayer-row={r.name}
              data-next={r.isNext ? 'true' : undefined}
              data-now={r.isCurrent ? 'true' : undefined}
              data-passed={r.isPassed ? 'true' : undefined}
              aria-current={r.isNext ? 'time' : undefined}
              className={cn(
                'relative flex min-h-14 items-center gap-3 px-5 py-2.5',
                // A bar at the left edge: teal for the next prayer, gold for the one whose time is in
                (r.isNext || r.isCurrent) && 'before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-r-full',
                r.isNext && 'bg-teal/[0.08] before:bg-teal',
                r.isCurrent && 'before:bg-gold',
              )}
            >
              <span className={cn('flex-1 text-[15px]', weight, tone)}>
                {TIME_LABELS[r.name]}
                {r.isNext && <span className="sr-only"> (next)</span>}
                {r.isCurrent && (
                  <span className="ml-2 text-[11px] font-semibold text-gold-deep" data-now-tag>
                    now
                  </span>
                )}
              </span>
              {r.startMs === null ? (
                <span className="text-sm text-muted">No time today</span>
              ) : (
                <span className={cn('text-right text-[15px] tabular-nums', weight, tone)} data-estimated={r.estimated || undefined}>
                  {r.estimated && (
                    <abbr title="estimated" aria-label="estimated" className="mr-1.5 text-[11px] font-semibold text-gold-deep no-underline">
                      est.
                    </abbr>
                  )}
                  {format(r.startMs)}
                  {/* Past midnight (a summer Isha far north): say so, or the time reads as this morning's */}
                  {r.dayShift !== 0 && (
                    <span className="block text-[11px] font-normal leading-4 text-muted" data-day-shift={r.dayShift}>
                      {r.dayShift > 0 ? 'after midnight' : 'before midnight'}
                    </span>
                  )}
                </span>
              )}
              {/* The tracker's column: every row takes its width once any row draws a tick, so the times line up */}
              <span
                data-tracker-slot
                className="-ml-3 flex w-0 shrink-0 justify-end group-has-[[data-tracker-slot]:not(:empty)]/times:ml-0 group-has-[[data-tracker-slot]:not(:empty)]/times:w-9"
              >
                {isPrayer && r.startMs !== null && r.endMs !== null && (
                  <RowTracker iso={model.iso} prayer={r.name as PrayerName} startMs={r.startMs} endMs={r.endMs} />
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Under the list when a time doesn't exist today: what happened, and the fix where there is one */
function MissingNote({ missing, rule }: { missing: readonly string[]; rule: string }) {
  const names = joinNames(missing);
  return (
    <p className="px-1 text-xs leading-relaxed text-muted" data-missing-times>
      {rule === 'auto' ? (
        <>At this latitude the sun doesn’t give {names} today, so none is shown rather than a wrong one.</>
      ) : (
        <>
          The sun doesn’t give {names} here today.{' '}
          <Link href="/prayer/settings#high-latitude" className="font-semibold text-teal underline underline-offset-2">
            Switch the high-latitude rule to Automatic
          </Link>{' '}
          to fill {missing.length === 1 ? 'it' : 'them'} in.
        </>
      )}
    </p>
  );
}

/** On a polar day: which times are borrowed, said once, calmly, with where to change it */
function PolarNote({ text }: { text: string }) {
  return (
    <p className="px-1 text-xs leading-relaxed text-muted" data-polar-note>
      {text}{' '}
      <Link href="/prayer/settings#high-latitude" className="font-semibold text-teal underline underline-offset-2">
        High-latitude rule
      </Link>
      {' · '}
      <Link href="/prayer/why" className="font-semibold text-teal underline underline-offset-2">
        Why times differ
      </Link>
    </p>
  );
}

/** The explainer, under the times it explains (prayer settings open from the place chip at the top) */
function WhyLink() {
  return (
    <div className="flex justify-center text-sm">
      <Link href="/prayer/why" className="inline-flex min-h-11 items-center font-semibold text-teal" data-hub-why>
        Why times differ
      </Link>
    </div>
  );
}

/** The /prayer hub (all-in-one spec 2.2) */
export default function PrayerHub() {
  const place = usePlace();
  const setupDone = usePrayerStore((s) => s.setupDone);
  const ready = !!place && setupDone;
  const mod = usePrayerModule(ready);
  const settings = useModelSettings();
  const now = useNow(15_000, ready);
  // The app renders on the client only (Providers waits for mount), so these read the device directly
  const [deviceTz] = useState(() => (typeof window === 'undefined' ? '' : deviceTimeZone()));
  const [dismissedTz, setDismissedTz] = useState(() => (typeof window === 'undefined' ? '' : readDismissed()));

  if (!ready) {
    return (
      <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-prayer-hub="setup">
        <Header subtitle={<p className="text-sm text-muted">Times, qibla and worship tools</p>} />
        <main className="mx-auto max-w-2xl space-y-4 px-4 pt-3">
          <SetupCard />
          <PrayerToolTiles />
        </main>
        <BottomNav />
      </div>
    );
  }

  const hour12 = prefers12h();
  const model = mod ? mod.buildHub(place, settings, now) : null;
  const format = (ms: number) => (mod ? mod.formatTime(ms, place.tz, { hour12 }) : '');
  const tzMismatch = !!mod && !!deviceTz && dismissedTz !== deviceTz && mod.zoneDiffers(place.tz, deviceTz, now);
  const afterPrayer = model?.current?.prayer ?? null;

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-prayer-hub="times">
      <Header
        subtitle={
          // The place as a chip: it opens prayer settings (the gear is the app's own settings)
          <Link
            href="/prayer/settings"
            className="relative mt-2 flex min-h-9 w-fit max-w-full items-center gap-1.5 rounded-full border border-foreground/10 bg-card py-1 pl-2.5 pr-1.5 text-sm text-foreground after:absolute after:-inset-y-1 after:inset-x-0 hover:bg-foreground/[0.03]"
            data-place-label
          >
            <MapPinIcon size={14} className="shrink-0 text-teal" />
            <span className="truncate font-medium">{place.label || 'Your place'}</span>
            <span className="sr-only">, prayer settings</span>
            <span className="shrink-0 text-xs text-muted" aria-hidden>
              · Settings
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden>
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        }
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-3">
        <HijriLine now={now} />

        {tzMismatch && (
          <div className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gold/[0.07] py-1.5 pl-3.5 pr-1.5 text-sm" role="status" data-tz-mismatch>
            <p className="min-w-0 flex-1 text-foreground">
              Your phone is on a different time zone.{' '}
              <Link href="/prayer/settings#place" className="font-semibold text-teal underline underline-offset-2">
                Update location?
              </Link>
            </p>
            <button
              type="button"
              aria-label="Dismiss"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-foreground/5"
              onClick={() => {
                setDismissedTz(deviceTz);
                try {
                  localStorage.setItem(TZ_DISMISS_KEY, deviceTz);
                } catch {
                  /* private mode: it only stays dismissed for this visit */
                }
              }}
            >
              <XIcon size={16} />
            </button>
          </div>
        )}

        {model ? (
          <>
            <NextHero model={model} format={format} now={now} until={mod!.formatUntil} />
            <div className="space-y-1.5">
              <TimesList model={model} format={format} />
              {model.missing.length > 0 && <MissingNote missing={model.missing} rule={settings.highLatRule} />}
              {model.polar && mod && <PolarNote text={mod.polarNote(model.polar)!} />}
            </div>
            {/*
              At most one contextual chip. The Ramadan banner decides for itself whether it is in
              season (it renders nothing otherwise, spec 3.4); only when it is empty do the adhkar
              for now show. An empty slot takes no room.
            */}
            <div className="peer/ramadan empty:hidden" data-chip="ramadan">
              <RamadanBanner />
            </div>
            <div className="empty:hidden peer-[:not(:empty)]/ramadan:hidden" data-chip="adhkar">
              <AdhkarNow window={model.window} afterPrayer={afterPrayer} />
            </div>
            <WhyLink />
          </>
        ) : (
          <HubSkeleton />
        )}

        <PrayerToolTiles />
      </main>
      <BottomNav />
    </div>
  );
}

/** "Fajr and Isha" */
function joinNames(names: readonly string[]): string {
  const labels = names.map((n) => TIME_LABELS[n as keyof typeof TIME_LABELS]);
  return labels.length <= 1 ? (labels[0] ?? '') : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** Holds the layout for the moment the engine takes to load */
function HubSkeleton() {
  return (
    <div aria-hidden className="space-y-4">
      <div className="h-[7.25rem] rounded-2xl border border-foreground/10 bg-card" />
      <div className="h-[21rem] rounded-2xl border border-foreground/10 bg-card" />
    </div>
  );
}
