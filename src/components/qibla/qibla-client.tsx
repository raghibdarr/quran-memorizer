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
import { toTrueHeading, turnToQibla } from '@/lib/qibla/heading';
import { haptic } from '@/lib/haptics';
import { isNative } from '@/lib/native';
import QiblaDial from './qibla-dial';
import SunAid from './sun-aid';
import CalibrationHint from './calibration-hint';

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
  }, [bearing, declination]);

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
    if ((await requestCompassPermission()) === 'denied') {
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

  return (
    <>
      <p className="text-center text-sm text-muted">
        From {label || 'your saved place'} ·{' '}
        <Link href="/prayer/settings" className="font-medium text-teal underline-offset-2 hover:underline">
          Change
        </Link>
      </p>

      <Card className="px-4 pt-5 pb-5">
        <div className="mx-auto w-full max-w-[17.5rem]">
          <QiblaDial bearing={bearing} heading={liveNow ? live.heading : null} aligned={!!liveNow && live.aligned} />
        </div>

        <div className="mt-4 text-center" data-qibla-readout={liveNow ? 'live' : 'diagram'}>
          {liveNow ? (
            <>
              <p className="text-2xl font-bold text-foreground" aria-live="polite">
                {live.aligned ? 'Facing the qibla' : `Turn ${Math.round(Math.abs(turn))}° ${turn > 0 ? 'right' : 'left'}`}
              </p>
              <p className="mt-1 text-sm text-muted">
                Qibla {rounded}° · you face {Math.round(live.heading) % 360}°
              </p>
            </>
          ) : (
            <>
              <p className="text-5xl font-bold tabular-nums text-foreground" data-qibla-bearing>
                {rounded}°
              </p>
              <p className="mt-1 text-sm text-muted">
                clockwise from true north, {compassPoint(bearing)}
              </p>
            </>
          )}
        </div>
      </Card>

      {liveNow && live.calibrate && <CalibrationHint />}

      <SunAid lat={lat} lng={lng} bearing={bearing} />

      {/* The one action: start or stop the compass */}
      {mode === 'diagram' && canUseCompass && (
        <button
          type="button"
          onClick={startFromTap}
          className="tactile-btn w-full rounded-xl bg-teal px-6 py-3 font-semibold text-on-teal hover:bg-teal-light"
        >
          Use my phone’s compass
        </button>
      )}
      {mode === 'starting' && (
        <button type="button" disabled className="w-full rounded-xl bg-teal/60 px-6 py-3 font-semibold text-on-teal">
          Starting the compass…
        </button>
      )}
      {mode === 'live' && (
        <button
          type="button"
          onClick={() => showDiagram()}
          className="w-full rounded-xl px-6 py-3 text-sm font-semibold text-muted hover:bg-foreground/5 hover:text-foreground"
        >
          Show the diagram instead
        </button>
      )}

      <div className="space-y-2 px-1 text-center text-xs leading-relaxed text-muted" data-qibla-notes>
        {notice === 'denied' && (
          <p data-qibla-notice="denied">
            Motion access is off, so the compass can’t run. You can allow it in Settings, or use the bearing and the sun.
          </p>
        )}
        {notice === 'no-data' && (
          <p data-qibla-notice="no-data">No compass reading came through on this device. The bearing and the sun still work.</p>
        )}
        {support === 'none' && (
          <p data-qibla-notice="no-sensor">This device has no compass. Find north, then turn to the bearing above, or use the sun.</p>
        )}
        {weakField && (
          <p data-qibla-notice="weak-field">
            You’re close to the magnetic pole, where phone compasses wander. Use the bearing or the sun instead.
          </p>
        )}
        {liveNow && live.reference === 'magnetic' && (
          <p>This compass reads magnetic north, which can differ from true north by a few degrees where you are.</p>
        )}
        <p>
          Phone compasses can be off by a few degrees, more near metal, magnets or electronics. The bearing itself is
          exact for your place.
        </p>
      </div>
    </>
  );
}
