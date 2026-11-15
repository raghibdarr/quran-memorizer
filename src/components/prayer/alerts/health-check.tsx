'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircleIcon, ClockIcon } from '@/components/ui/icons';
import { PRAYER_SYNCED_EVENT, requestPrayerResync } from '@/components/prayer-sync';
import {
  alertPermission,
  batteryUnrestricted,
  exactAlarmState,
  forcePrayerResync,
  openBatterySettings,
  openExactAlarmSetting,
  pendingPrayerAlerts,
  sendTestAlert,
  type PendingSummary,
  type PermissionState,
} from '@/lib/prayer/notifications';
import type { AlertPlatform } from '@/lib/prayer/schedule';
import type { AlertMode } from '@/types/prayer';
import { AlertCircleIcon } from './alert-icons';

interface Health {
  permission: PermissionState;
  exact: 'granted' | 'denied' | 'unsupported';
  /** null: can't tell on this phone (iOS, or an app build without the helper) */
  battery: boolean | null;
  pending: PendingSummary;
}

interface Props {
  platform: Exclude<AlertPlatform, 'web'>;
  /** The place's zone, for the "up to" date */
  tz: string;
  /** Changes when the screen wants a fresh look */
  checkKey: number;
  /** Asks for notification permission (the screen's own flow) */
  onAllow: () => Promise<boolean>;
  /** How the test alert should sound */
  testMode: AlertMode;
}

async function probe(): Promise<Health> {
  const [permission, exact, battery, pending] = await Promise.all([
    alertPermission(),
    exactAlarmState(),
    batteryUnrestricted(),
    pendingPrayerAlerts(),
  ]);
  return { permission, exact, battery, pending };
}

function upTo(ms: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(ms);
  } catch {
    return new Date(ms).toDateString();
  }
}

/**
 * What stands between a prayer alert and the user, each with a pass or a fix:
 * notification permission, exact alarms and battery saving (Android), what is
 * set, and a test alert. Looks again on every return to the app, since most
 * fixes happen in the phone's settings. Shown once at least one prayer is on.
 */
export default function HealthCheck({ platform, tz, checkKey, onAllow, testMode }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [test, setTest] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const refresh = useCallback(() => {
    probe().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, checkKey]);

  // The sync can take a while to hand a month of alerts to the phone: look again when it is done
  useEffect(() => {
    window.addEventListener(PRAYER_SYNCED_EVENT, refresh);
    return () => window.removeEventListener(PRAYER_SYNCED_EVENT, refresh);
  }, [refresh]);

  useEffect(() => {
    let wasExact: Health['exact'] | null = null;
    const onVisible = () => {
      if (document.hidden) return;
      probe()
        .then((h) => {
          // Back from the alarms screen with the grant: replan so alerts become exact
          if (wasExact === 'denied' && h.exact === 'granted') {
            forcePrayerResync();
            requestPrayerResync();
          }
          wasExact = h.exact;
          setHealth(h);
        })
        .catch(() => {});
    };
    exactAlarmState().then((e) => (wasExact = e)).catch(() => {});
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const sendTest = async () => {
    if (test === 'sending' || test === 'sent') return;
    clearTimeout(resetTimer.current);
    setTest('sending');
    const ok = (health?.permission === 'granted' || (await onAllow())) && (await sendTestAlert(testMode));
    setTest(ok ? 'sent' : 'failed');
    if (!ok) refresh();
    // The answer shows on the button itself, held while the test is on its way
    resetTimer.current = setTimeout(() => setTest('idle'), 10_000);
  };

  const h = health;
  return (
    <section aria-labelledby="alerts-health" data-alerts-health>
      <h2 id="alerts-health" className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        Health check
      </h2>
      <div className="divide-y divide-foreground/5 rounded-2xl border border-foreground/10 bg-card">
        {!h ? (
          <p className="px-4 py-4 text-sm text-muted">Checking…</p>
        ) : (
          <>
            <Row
              id="permission"
              status={h.permission === 'granted' ? 'ok' : 'fix'}
              title="Notifications"
              detail={
                h.permission === 'granted'
                  ? 'Allowed'
                  : h.permission === 'denied'
                    ? 'Off for Takrar. Turn them on in your phone’s Settings, under Takrar.'
                    : 'Not allowed yet'
              }
              action={h.permission === 'prompt' ? { label: 'Allow', hint: 'Allow notifications', run: () => onAllow().then(refresh) } : undefined}
            />
            {platform === 'android' && (
              <Row
                id="exact"
                status={h.exact === 'granted' ? 'ok' : 'fix'}
                title="On-time delivery"
                detail={
                  h.exact === 'granted'
                    ? 'Alerts arrive at the minute'
                    : 'Alerts may arrive several minutes late. Turn on ‘Alarms & reminders’ for Takrar.'
                }
                action={h.exact === 'denied' ? { label: 'Open settings', hint: 'Open alarm settings', run: () => openExactAlarmSetting().then(() => undefined) } : undefined}
              />
            )}
            {platform === 'android' && h.battery !== null && (
              <Row
                id="battery"
                status={h.battery ? 'ok' : 'fix'}
                title="Battery saving"
                detail={h.battery ? 'Takrar is not restricted' : 'Battery saving can delay or stop alerts. Set Takrar to ‘Unrestricted’ or similar.'}
                action={h.battery ? undefined : { label: 'Open settings', hint: 'Open battery settings', run: () => openBatterySettings().then(() => undefined) }}
              />
            )}
            <Row
              id="pending"
              status={h.pending.count > 0 ? 'ok' : h.permission === 'granted' ? 'wait' : 'fix'}
              title="Set on this phone"
              detail={
                h.pending.count > 0
                  ? `${h.pending.count} ${h.pending.count === 1 ? 'alert' : 'alerts'}${h.pending.lastAt ? `, up to ${upTo(h.pending.lastAt, tz)}` : ''}`
                  : h.permission === 'granted'
                    ? 'Setting them up…'
                    : 'None yet: notifications aren’t allowed'
              }
            />
          </>
        )}
      </div>
      {platform === 'ios' && (
        <p className="mt-2 px-1 text-xs text-muted">iPhone holds a limited number of alerts at once. Opening Takrar tops them up.</p>
      )}

      <button
        type="button"
        onClick={sendTest}
        disabled={test === 'sending' || test === 'sent'}
        className="tactile-btn mt-4 flex min-h-11 w-full items-center justify-center rounded-xl bg-teal/10 px-4 text-sm font-semibold text-teal"
        data-alerts-test={test}
      >
        {test === 'sent' ? 'Sent. Lock your phone to see it arrive.' : test === 'failed' ? 'Couldn’t send. Check notifications above.' : 'Send a test alert'}
      </button>
      <p className="mt-2 px-1 text-center text-xs text-muted">
        {test === 'sent' && h?.exact === 'denied' ? 'Without on-time delivery it can take a few minutes.' : 'Arrives in 10 seconds'}
      </p>
      <span className="sr-only" role="status">
        {test === 'sent' ? 'Test alert sent. Lock your phone to see it arrive.' : test === 'failed' ? 'Couldn’t send a test alert. Check notifications above.' : ''}
      </span>
    </section>
  );
}

function Row({
  id,
  status,
  title,
  detail,
  action,
}: {
  id: string;
  /** ok: passes; fix: needs the user; wait: Takrar is still working on it */
  status: 'ok' | 'fix' | 'wait';
  title: string;
  detail: string;
  /** `hint` is the button's name for screen readers (two rows say "Open settings") */
  action?: { label: string; hint?: string; run: () => Promise<unknown> };
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3" data-health={id} data-ok={status === 'ok' ? 'true' : 'false'} data-status={status}>
      {status === 'ok' ? (
        <CheckCircleIcon size={20} className="shrink-0 text-teal" />
      ) : status === 'wait' ? (
        <ClockIcon size={20} className="shrink-0 text-muted" />
      ) : (
        <AlertCircleIcon size={20} className="shrink-0 text-gold-deep" />
      )}
      <span className="sr-only">{status === 'ok' ? 'Fine: ' : status === 'wait' ? 'In progress: ' : 'Needs attention: '}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted">{detail}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={() => void action.run()}
          aria-label={action.hint}
          className="pressable min-h-11 shrink-0 rounded-xl bg-gold/10 px-4 text-sm font-semibold text-gold-deep"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
