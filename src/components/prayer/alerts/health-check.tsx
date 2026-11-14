'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircleIcon, ClockIcon } from '@/components/ui/icons';
import { requestPrayerResync } from '@/components/prayer-sync';
import { cn } from '@/lib/cn';
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

interface Health {
  permission: PermissionState;
  exact: 'granted' | 'denied' | 'unsupported';
  /** null: can't tell on this phone (iOS, or an app build without the helper) */
  battery: boolean | null;
  pending: PendingSummary;
}

interface Props {
  platform: Exclude<AlertPlatform, 'web'>;
  anyOn: boolean;
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
 * fixes happen in the phone's settings.
 */
export default function HealthCheck({ platform, anyOn, tz, checkKey, onAllow, testMode }: Props) {
  const [health, setHealth] = useState<Health | null>(null);
  const [test, setTest] = useState<'idle' | 'sent' | 'failed'>('idle');

  const refresh = useCallback(() => {
    probe().then(setHealth).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh, checkKey]);

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
    if (health?.permission !== 'granted' && !(await onAllow())) return;
    const ok = await sendTestAlert(testMode);
    setTest(ok ? 'sent' : 'failed');
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
              ok={h.permission === 'granted'}
              title="Notifications"
              detail={
                h.permission === 'granted'
                  ? 'Allowed'
                  : h.permission === 'denied'
                    ? 'Turned off for Takrar. Allow them in your phone’s settings.'
                    : 'Not allowed yet'
              }
              action={h.permission === 'prompt' ? { label: 'Allow', run: () => onAllow().then(refresh) } : undefined}
            />
            {platform === 'android' && (
              <Row
                id="exact"
                ok={h.exact === 'granted'}
                title="On-time delivery"
                detail={h.exact === 'granted' ? 'Alerts arrive at the minute' : 'Alerts may arrive several minutes late'}
                action={h.exact === 'denied' ? { label: 'Open settings', run: () => openExactAlarmSetting().then(() => undefined) } : undefined}
              />
            )}
            {platform === 'android' && h.battery !== null && (
              <Row
                id="battery"
                ok={h.battery}
                title="Battery saving"
                detail={h.battery ? 'Takrar is not restricted' : 'Battery saving can delay or stop alerts'}
                action={h.battery ? undefined : { label: 'Open settings', run: () => openBatterySettings().then(() => undefined) }}
              />
            )}
            <Row
              id="pending"
              ok={!anyOn || h.pending.count > 0}
              neutral={!anyOn}
              title="Set on this phone"
              detail={
                h.pending.count > 0 && h.pending.lastAt
                  ? `${h.pending.count} ${h.pending.count === 1 ? 'alert' : 'alerts'}, up to ${upTo(h.pending.lastAt, tz)}`
                  : anyOn
                    ? h.permission === 'granted'
                      ? 'Setting them up…'
                      : 'None yet: notifications aren’t allowed'
                    : 'None: every prayer is off'
              }
            />
          </>
        )}
      </div>
      {platform === 'ios' && anyOn && (
        <p className="mt-2 px-1 text-xs text-muted">iPhone holds a limited number of alerts at once. Opening Takrar tops them up.</p>
      )}

      <button
        type="button"
        onClick={sendTest}
        className="pressable mt-3 flex min-h-11 w-full items-center justify-center rounded-xl bg-foreground/5 text-sm font-semibold text-foreground"
        data-alerts-test
      >
        Send a test alert in 10 seconds
      </button>
      {test !== 'idle' && (
        <p className="mt-2 px-1 text-center text-xs text-muted" role="status">
          {test === 'sent' ? 'On its way. Lock your phone to see it as it will arrive.' : 'Couldn’t send a test alert. Check that notifications are allowed.'}
        </p>
      )}
    </section>
  );
}

function Row({
  id,
  ok,
  neutral,
  title,
  detail,
  action,
}: {
  id: string;
  ok: boolean;
  neutral?: boolean;
  title: string;
  detail: string;
  action?: { label: string; run: () => Promise<unknown> };
}) {
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-3" data-health={id} data-ok={ok ? 'true' : 'false'}>
      {ok ? (
        <CheckCircleIcon size={20} className={cn('shrink-0', neutral ? 'text-muted' : 'text-teal')} />
      ) : (
        <ClockIcon size={20} className="shrink-0 text-gold-deep" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      {action && (
        <button
          type="button"
          onClick={() => void action.run()}
          className="pressable min-h-11 shrink-0 rounded-xl bg-gold/10 px-4 text-sm font-semibold text-gold-deep"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
