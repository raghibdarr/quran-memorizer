'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Card from '@/components/ui/card';
import { CompassIcon } from '@/components/ui/icons';
import { usePlaceStore } from '@/stores/place-store';
import { qiblaBearing } from '@/lib/prayer/engine';
import {
  AlignGate,
  HeadingFilter,
  compassPoint,
  detectCompassSupport,
  requestCompassPermission,
  startCompass,
  type CompassSupport,
  type RawHeading,
} from '@/lib/qibla/compass';
import { declinationAt } from '@/lib/qibla/declination';
import { nearKaaba, toTrueHeading, turnToQibla } from '@/lib/qibla/heading';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { isNative } from '@/lib/native';
import QiblaDial from './qibla-dial';
import SunAid from './sun-aid';
import CalibrationHint from './calibration-hint';
import { useReducedMotion } from './use-reduced-motion';

type Mode = 'diagram' | 'starting' | 'live';
type Notice = 'denied' | 'no-data' | null;

interface Live {
  heading: number;
  reference: 'true' | 'magnetic';
  calibrate: boolean;
  aligned: boolean;
}

/** What the compass can use here. Desktop browsers expose the event with no sensor behind it: treat them as none, so there's no button to a dead end */
function effectiveSupport(): CompassSupport {
  if (typeof window === 'undefined') return 'none';
  const s = detectCompassSupport();
  if (s === 'absolute' && !isNative() && !window.matchMedia('(pointer: coarse)').matches) return 'none';
  return s;
}

/** iOS's own accuracy estimate: worse than this (or unknown) also asks for a figure 8 */
const IOS_ACCURACY_LIMIT = 25;

export default function QiblaClient() {
  const place = usePlaceStore((s) => s.place);

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-qibla>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/prayer" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Qibla</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-3 px-4 pt-5">
        {place ? <QiblaFinder lat={place.lat} lng={place.lng} label={place.label} /> : <NoPlace />}
      </main>

      <BottomNav />
    </div>
  );
}

function NoPlace() {
  return (
    <div data-qibla-no-place>
      <Card className="px-5 py-8 text-center">
        <CompassIcon size={28} className="mx-auto text-teal" />
        <h2 className="mt-3 text-base font-semibold text-foreground">Set your place first</h2>
        <p className="mx-auto mt-1 max-w-[18rem] text-sm leading-relaxed text-muted">
          The qibla is worked out on your phone from where you are. Your location never leaves it.
        </p>
        <Link
          href="/prayer/setup"
          className="tactile-btn mt-5 inline-block rounded-xl bg-teal px-6 py-3 font-semibold text-on-teal hover:bg-teal-light"
        >
          Set your place
        </Link>
      </Card>
    </div>
  );
}

function QiblaFinder({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  const bearing = useMemo(() => qiblaBearing({ lat, lng }), [lat, lng]);
  const declination = useMemo(() => declinationAt(lat, lng, new Date()), [lat, lng]);
  const weakField = declination.ok && declination.weakField;
  // In Makkah a saved place (a city centre, or a coarse fix) is too rough to give a direction
  const closeToKaaba = useMemo(() => nearKaaba(lat, lng), [lat, lng]);

  // Screens render only after mount (Providers), so the browser is there to ask
  const [support] = useState<CompassSupport>(effectiveSupport);
  const autoStart = support === 'absolute' && isNative() && !weakField;
  const [mode, setMode] = useState<Mode>(autoStart ? 'starting' : 'diagram');
  const [notice, setNotice] = useState<Notice>(null);
  const [live, setLive] = useState<Live | null>(null);

  const stopRef = useRef<(() => void) | null>(null);
  const filterRef = useRef(new HeadingFilter());
  const gateRef = useRef(new AlignGate());
  const latestRef = useRef<RawHeading | null>(null);
  const frameRef = useRef(0);
  // Read through refs so a place update while the compass runs doesn't tear the sensor down
  const targetRef = useRef({ bearing, declination });
  const mountedRef = useRef(true);
  useEffect(() => {
    targetRef.current = { bearing, declination };
  }, [bearing, declination]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    latestRef.current = null;
  }, []);

  const showDiagram = useCallback(
    (why: Notice = null) => {
      stop();
      setLive(null);
      setMode('diagram');
      setNotice(why);
    },
    [stop],
  );

  // One state update per frame at most, whatever rate the sensor fires at
  const process = useCallback(() => {
    frameRef.current = 0;
    const raw = latestRef.current;
    if (!raw) return;
    const { bearing, declination } = targetRef.current;
    const r = filterRef.current.push(raw.heading, raw.t);
    const t = toTrueHeading({ heading: r.heading, reference: raw.reference }, declination);
    const entered = gateRef.current.update(turnToQibla(t.heading, bearing));
    if (entered) haptic.success();
    const iosUnsure = raw.accuracy !== undefined && (raw.accuracy < 0 || raw.accuracy > IOS_ACCURACY_LIMIT);
    const next: Live = {
      heading: t.heading,
      reference: t.reference,
      calibrate: r.needsCalibration || iosUnsure,
      aligned: gateRef.current.aligned,
    };
    setLive((prev) =>
      prev &&
      Math.abs(prev.heading - next.heading) < 0.2 &&
      prev.reference === next.reference &&
      prev.calibrate === next.calibrate &&
      prev.aligned === next.aligned
        ? prev
        : next,
    );
    setMode('live');
  }, []);

  // Sensor subscription only (no state change of its own, so an effect can call it)
  const subscribe = useCallback(() => {
    stop();
    filterRef.current.reset();
    gateRef.current = new AlignGate();
    stopRef.current = startCompass({
      onReading: (r) => {
        latestRef.current = r;
        if (!frameRef.current) frameRef.current = requestAnimationFrame(process);
      },
      onNoData: () => showDiagram('no-data'),
    });
  }, [process, showDiagram, stop]);

  const listen = useCallback(() => {
    setNotice(null);
    setMode('starting');
    subscribe();
  }, [subscribe]);

  // Motion permission is asked only here, from the tap (iOS requires it)
  const startFromTap = useCallback(async () => {
    setMode('starting');
    const answer = await requestCompassPermission();
    if (!mountedRef.current) return; // left the screen while the prompt was up
    if (answer === 'denied') {
      showDiagram('denied');
      return;
    }
    listen();
  }, [listen, showDiagram]);

  useEffect(() => {
    // In the Android app the sensor needs no permission: start straight away.
    // The web, and iOS (which must ask from a tap), start on the diagram.
    if (autoStart) subscribe();
    return stop;
  }, [autoStart, subscribe, stop]);

  const liveNow = mode === 'live' && live;
  const turn = liveNow ? turnToQibla(live.heading, bearing) : 0;
  const rounded = Math.round(bearing) % 360;
  const canUseCompass = support !== 'none' && !weakField;
  const point = compassPoint(bearing);
  const direction = point.charAt(0).toUpperCase() + point.slice(1);

  // Once the compass comes alive, bring the dial into view: on a small phone the
  // button that started it can sit below the dial, which is then off the top
  const dialRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const isLive = !!liveNow;
  useEffect(() => {
    if (!isLive) return;
    const el = dialRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 64 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }, [isLive, reduceMotion]);

  // One button whose job changes, so keyboard and screen-reader focus stay on it
  const showButton = mode !== 'diagram' || canUseCompass;
  const button =
    mode === 'live'
      ? { label: 'Show the diagram instead', onClick: () => showDiagram() }
      : mode === 'starting'
        ? { label: 'Starting the compass…', onClick: undefined }
        : notice
          ? { label: 'Try the compass again', onClick: startFromTap }
          : { label: 'Use my phone’s compass', onClick: startFromTap };

  // At most one footnote per state; the accuracy caveat only while the compass runs
  const footnote =
    support === 'none' ? (
      <p data-qibla-notice="no-sensor">This device has no compass. Find north, then turn to the bearing above, or use the sun.</p>
    ) : weakField ? (
      <p data-qibla-notice="weak-field">
        You’re close to the magnetic pole, where phone compasses wander. Use the bearing or the sun instead.
      </p>
    ) : liveNow ? (
      <p>
        {live.reference === 'magnetic' &&
          'This compass reads magnetic north, which can differ from true north by a few degrees where you are. '}
        Phone compasses can be off by a few degrees, more near metal, magnets or electronics.
      </p>
    ) : null;

  return (
    <>
      <p className="text-center text-sm text-muted">
        From {label || 'your saved place'} ·{' '}
        <Link href="/prayer/settings" className="font-medium text-teal underline-offset-2 hover:underline">
          Change
        </Link>
      </p>

      {closeToKaaba && (
        <div data-qibla-notice="near-kaaba">
          <Card className="p-4 text-sm leading-relaxed text-foreground">
            You’re in or near Makkah. This close, a saved place is too rough to give a direction, so follow the mosques
            around you.
          </Card>
        </div>
      )}

      <div ref={dialRef} className="scroll-mt-[calc(var(--safe-top)+4.5rem)]">
        <Card className="px-4 pt-5 pb-5">
          <div className="mx-auto w-full max-w-[15rem] min-[360px]:max-w-[19rem] sm:max-w-[22rem]">
            <QiblaDial bearing={bearing} heading={liveNow ? live.heading : null} aligned={!!liveNow && live.aligned} />
          </div>

          <div className="mt-5 text-center" data-qibla-readout={liveNow ? 'live' : 'diagram'}>
            {liveNow ? (
              <>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {live.aligned ? 'Facing the qibla' : `Turn ${Math.round(Math.abs(turn))}° ${turn > 0 ? 'right' : 'left'}`}
                </p>
                <p className="mt-1 text-sm text-muted">
                  Qibla {rounded}° · you face {Math.round(live.heading) % 360}°
                </p>
              </>
            ) : (
              <>
                <p
                  className={cn('font-bold leading-tight text-foreground', closeToKaaba ? 'text-xl' : 'text-3xl')}
                  data-qibla-direction
                >
                  {direction}
                </p>
                <p className={cn('mt-1 text-muted', closeToKaaba ? 'text-sm' : 'text-base')}>
                  <span className="font-semibold tabular-nums text-foreground" data-qibla-bearing>
                    {rounded}°
                  </span>{' '}
                  from north
                </p>
                {canUseCompass && !closeToKaaba && !notice && mode === 'diagram' && (
                  <p className="mx-auto mt-3 max-w-[18rem] text-balance text-sm text-muted">
                    Hold your phone flat, start the compass and turn until the Kaaba is at the top.
                  </p>
                )}
              </>
            )}
          </div>

          {notice && (
            <div
              role="status"
              className="mt-4 rounded-xl bg-gold/10 px-4 py-3 text-center text-sm leading-relaxed text-foreground"
              data-qibla-notice={notice}
            >
              {notice === 'denied'
                ? 'Motion access is off, so the compass can’t run. You can allow it in your phone’s Settings, or use the bearing and the sun.'
                : 'No compass reading came through on this device. The bearing and the sun still work.'}
            </div>
          )}

          {/* The one action: start or stop the compass */}
          {showButton && (
            <button
              type="button"
              onClick={button.onClick}
              aria-disabled={mode === 'starting' || undefined}
              aria-busy={mode === 'starting' || undefined}
              className={cn(
                'mt-4 w-full rounded-xl px-6 py-3 font-semibold',
                mode === 'live'
                  ? 'border-[1.5px] border-transparent text-muted hover:bg-foreground/5 hover:text-foreground'
                  : 'tactile-btn bg-teal text-on-teal hover:bg-teal-light',
                mode === 'starting' && 'cursor-default opacity-60 hover:bg-teal',
              )}
              data-qibla-action={mode}
            >
              {button.label}
            </button>
          )}
        </Card>
      </div>

      {/* Screen readers hear which way to turn when that changes, not every degree on the way */}
      <p className="sr-only" role="status" data-qibla-status>
        {liveNow ? turnGuidance(live.aligned, turn) : ''}
      </p>

      {liveNow && live.calibrate && <CalibrationHint />}

      <SunAid lat={lat} lng={lng} bearing={bearing} />

      {footnote && (
        <div className="px-1 text-center text-xs leading-relaxed text-muted" data-qibla-notes>
          {footnote}
        </div>
      )}
    </>
  );
}

/** Coarse spoken guidance: changes only when the instruction itself changes */
function turnGuidance(aligned: boolean, turn: number): string {
  if (aligned) return 'Facing the qibla';
  const side = turn > 0 ? 'right' : 'left';
  return Math.abs(turn) > 20 ? `Turn ${side}` : `Nearly there, a little ${side}`;
}
