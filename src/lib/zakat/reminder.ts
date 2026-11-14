'use client';

// The OS side of the hawl reminder: native shells only, a no-op on the web.
// Hands planHawlReminder() to applyRange, which skips the call entirely when
// the plan is the same as the last one applied.

import { LocalNotifications } from '@capacitor/local-notifications';
import { applyRange, type ApplyResult } from '@/lib/notify/apply';
import { NOTIFY_RANGES } from '@/lib/notify/registry';
import { isNative, nativePlatform } from '@/lib/native';
import { planHawlReminder } from './hawl';

const CHANNEL_ID = 'zakat-v1';

let channelReady: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  if (nativePlatform() !== 'android') return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Zakat year',
    description: 'Once a year, on the day your zakat year is expected to complete',
    importance: 3,
  }).catch(() => {});
  return channelReady;
}

/** Whether this device can show the reminder at all */
export const hawlReminderSupported = (): boolean => isNative();

/** Asks the OS (only ever from a user gesture). True when notifications may be shown. */
export async function requestHawlPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { display } = await LocalNotifications.requestPermissions();
    return display === 'granted';
  } catch {
    return false;
  }
}

/** Schedule (or clear) the hawl reminder to match the user's settings */
export async function syncHawlReminder(opts: {
  enabled: boolean;
  hawlStartIso: string | null;
  offset: number;
  now?: Date;
}): Promise<ApplyResult> {
  if (!isNative()) return { status: 'unsupported' };
  const planned = planHawlReminder({ ...opts, now: opts.now ?? new Date() });
  if (planned.length) await ensureChannel();
  const withChannel = planned.map((n) => ({ ...n, channelId: CHANNEL_ID, smallIcon: 'ic_stat_takrar', iconColor: '#1B4D5C' }));
  return applyRange(NOTIFY_RANGES.reminders, withChannel);
}
