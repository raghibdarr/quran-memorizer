'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/app-link';
import BackButton from '@/components/ui/back-button';
import BottomNav from '@/components/layout/bottom-nav';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { requestPrayerResync } from '@/components/prayer-sync';
import { usePlaceStore } from '@/stores/place-store';
import { calcSettingsOf, usePrayerStore } from '@/stores/prayer-store';
import { nativePlatform } from '@/lib/native';
import { computeDay, formatTime, isoInTz } from '@/lib/prayer/engine';
import { modesFor, type AlertPlatform } from '@/lib/prayer/schedule';
import { alertPermission, forcePrayerResync, requestAlertPermission, type PermissionState } from '@/lib/prayer/notifications';
import { PRAYER_NAMES, type AlertMode, type PrayerName } from '@/types/prayer';
import PrayerAlertRow from './prayer-alert-row';
import HealthCheck from './health-check';
import { BellIcon } from './alert-icons';

/**
 * /prayer/alerts (all-in-one spec 2.2, 6): per-prayer alert mode and heads-up,
 * and a health check of what stands between an alert and the user. Alerts are
 * local notifications set ahead on the phone, so the web only gets an honest
 * line. Notification permission is asked only when the user turns alerts on.
 */
export default function PrayerAlertsScreen() {
  // Providers render pages only after mount, so the platform is known here
  const platform: AlertPlatform = nativePlatform();

  return (
    <div className="min-h-dvh bg-cream pb-[calc(var(--tabbar-clearance)+1rem)]" data-prayer-alerts>
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto grid max-w-2xl grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2">
          <BackButton fallback="/prayer/settings" className="justify-self-start" />
          <h1 className="truncate text-center text-sm font-semibold text-teal">Prayer alerts</h1>
          <span aria-hidden />
        </div>
      </div>

      <main className="mx-auto max-w-2xl space-y-4 px-4 pt-5">
        {platform === 'web' ? <WebNotice /> : <NativeAlerts platform={platform} />}
      </main>

      <BottomNav />
    </div>
  );
}

function IconTile() {
  return (
    <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal/10 text-teal">
      <BellIcon size={24} />
    </span>
  );
}

function WebNotice() {
  return (
    <div data-alerts-web>
      <Card className="px-5 py-8 text-center">
        <IconTile />
        <p className="mx-auto mt-4 max-w-[17rem] text-base font-semibold text-balance text-foreground">Prayer alerts need the app. Times work here.</p>
        <p className="mx-auto mt-2 max-w-[19rem] text-sm leading-relaxed text-muted">
          A browser can&apos;t be woken at prayer time without sending your times to a server, and your location stays on your device.
        </p>
        <Link href="/prayer" className="tactile-btn mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal/10 px-5 text-sm font-semibold text-teal">
          See today&apos;s times
        </Link>
      </Card>
    </div>
  );
}

function NativeAlerts({ platform }: { platform: Exclude<AlertPlatform, 'web'> }) {
  const place = usePlaceStore((s) => s.place);
  const prayer = usePrayerStore();
  const { alerts, setAlert, setAllAlerts } = prayer;
  const [blocked, setBlocked] = useState(false);
  // What the phone says now, so a later visit still shows that alerts can't arrive
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [asking, setAsking] = useState(false);
  // Bumped when the health check should look again (after a grant or a settings change)
  const [checkKey, setCheckKey] = useState(0);

  const anyOn = PRAYER_NAMES.some((p) => alerts[p].mode !== 'off');
  const calc = calcSettingsOf(prayer);
  const calcKey = JSON.stringify(calc);

  // Today's times beside each prayer, in the place's zone
  const [openedAt] = useState(() => Date.now());
  const today = useMemo(() => {
    if (!place) return null;
    try {
      const day = computeDay(place, isoInTz(openedAt, place.tz), JSON.parse(calcKey));
      return Object.fromEntries(PRAYER_NAMES.map((p) => [p, day[p] === null ? null : formatTime(day[p]!, place.tz)])) as Record<PrayerName, string | null>;
    } catch {
      return null;
    }
  }, [place, calcKey, openedAt]);

  // The sync replans on its own after a settings change; the health check looks again shortly after
  useEffect(() => {
    const t = setTimeout(() => setCheckKey((k) => k + 1), 2500);
    return () => clearTimeout(t);
  }, [alerts]);

  // Look again on arrival, after a grant, and on every return from the phone's settings
  useEffect(() => {
    let live = true;
    const look = () => {
      if (document.hidden) return;
      alertPermission()
        .then((p) => {
          if (!live) return;
          setPermission(p);
          if (p === 'granted') setBlocked(false);
        })
        .catch(() => {});
    };
    look();
    document.addEventListener('visibilitychange', look);
    return () => {
      live = false;
      document.removeEventListener('visibilitychange', look);
    };
  }, [checkKey]);

  /** Ask for notification permission when alerts are being turned on; true when allowed */
  const allow = async (): Promise<boolean> => {
    if ((await alertPermission()) === 'granted') return true;
    setAsking(true);
    const ok = await requestAlertPermission();
    setAsking(false);
    setBlocked(!ok);
    alertPermission().then(setPermission).catch(() => {});
    if (ok) {
      forcePrayerResync();
      requestPrayerResync();
      setCheckKey((k) => k + 1);
    }
    return ok;
  };

  const changeMode = async (p: PrayerName, mode: AlertMode) => {
    if (alerts[p].mode === 'off' && mode !== 'off' && !(await allow())) return;
    setAlert(p, { mode });
  };

  const turnAllOn = async () => {
    if (!(await allow())) return;
    setAllAlerts('default');
  };

  if (!place) {
    return (
      <div data-alerts-no-place>
        <Card className="px-5 py-8 text-center">
          <IconTile />
          <p className="mx-auto mt-4 max-w-[18rem] text-balance text-sm leading-relaxed text-muted">
            Choose your place first, so alerts know when each prayer starts.
          </p>
          <Link href="/prayer/setup" className="tactile-btn mt-4 inline-flex min-h-11 items-center justify-center rounded-xl bg-teal px-5 text-sm font-semibold text-on-teal">
            Set up prayer times
          </Link>
        </Card>
      </div>
    );
  }

  const modes = modesFor(platform);
  const off = blocked || permission === 'denied';
  // Alerts are on but the phone won't show them: say so first, on every visit
  const notice: 'off' | 'ask' | null = off && (anyOn || blocked) ? 'off' : anyOn && permission === 'prompt' ? 'ask' : null;
  const chimeOnIos = platform === 'ios' && PRAYER_NAMES.some((p) => alerts[p].mode === 'chime');

  return (
    <>
      {!anyOn && (
        <div data-alerts-intro>
          <Card variant="tactile" className="text-center">
            <p className="text-base font-semibold text-foreground">Tell me when each prayer starts?</p>
            <p className="mx-auto mt-1 max-w-[20rem] text-sm leading-relaxed text-muted">
              Alerts are worked out and set on your phone, so they arrive offline too.
            </p>
            <Button onClick={turnAllOn} disabled={asking} className="mt-4 w-full min-h-11 text-sm">
              Notify me for every prayer
            </Button>
          </Card>
        </div>
      )}

      {notice && (
        <div className="rounded-2xl bg-gold/10 px-4 py-3" role="status" data-alerts-notice={notice}>
          <p className="text-sm font-semibold text-gold-deep">
            {notice === 'ask'
              ? 'Notifications aren’t allowed yet, so no alerts will arrive.'
              : anyOn
                ? 'Notifications are off for Takrar, so no alerts will arrive.'
                : 'Notifications are off for Takrar.'}
          </p>
          {notice === 'off' ? (
            <p className="mt-0.5 text-sm text-gold-deep/90">
              Turn them on in your phone&apos;s Settings, under Takrar, then {anyOn ? 'come back here' : 'try again'}.
            </p>
          ) : (
            <button
              type="button"
              onClick={() => void allow()}
              disabled={asking}
              className="pressable mt-2 min-h-11 rounded-xl bg-gold/15 px-4 text-sm font-semibold text-gold-deep"
            >
              Allow notifications
            </button>
          )}
        </div>
      )}

      <section aria-labelledby="alerts-each">
        <h2 id="alerts-each" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Each prayer
        </h2>
        <div className="divide-y divide-foreground/5 rounded-2xl border border-foreground/10 bg-card">
          {PRAYER_NAMES.map((p) => (
            <PrayerAlertRow
              key={p}
              prayer={p}
              time={today?.[p] ?? null}
              alert={alerts[p]}
              modes={modes}
              onMode={(m) => changeMode(p, m)}
              onPreAlert={(min) => setAlert(p, { preAlertMin: min })}
            />
          ))}
        </div>
        {platform === 'android' ? (
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
            Sound uses your phone&apos;s notification sound. Chime is Takrar&apos;s own short tone. Silent shows the alert without a sound.
          </p>
        ) : (
          <p className="mt-2 px-1 text-xs leading-relaxed text-muted">
            Silent shows the alert without a sound.{chimeOnIos ? ' The chime is Android only, so iPhone plays its notification sound.' : ''}
          </p>
        )}
      </section>

      {/* Nothing to check until a prayer is on: the intro card stays the one first step */}
      {anyOn && <HealthCheck platform={platform} tz={place.tz} checkKey={checkKey} onAllow={allow} testMode={firstOnMode(alerts)} />}
    </>
  );
}

const firstOnMode = (alerts: Record<PrayerName, { mode: AlertMode }>): AlertMode =>
  PRAYER_NAMES.map((p) => alerts[p].mode).find((m) => m !== 'off') ?? 'default';
