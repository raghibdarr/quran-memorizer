'use client';

// The OS side of reminders (M8): hands planReminders() output to the native
// notification scheduler. Native shells only; every call is a no-op on the web
// (web push is optional later polish — build plan §2a).

import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative, nativePlatform } from './native';
import { REMINDER_IDS, type Reminder } from './reminders';

const CHANNEL_ID = 'reminders';

export type ReminderPermission = 'granted' | 'denied' | 'prompt';

export async function reminderPermission(): Promise<ReminderPermission> {
  if (!isNative()) return 'denied';
  const { display } = await LocalNotifications.checkPermissions();
  return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
}

/** Asks the OS (only ever from a user gesture). True when notifications may be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNative()) return false;
  const { display } = await LocalNotifications.requestPermissions();
  return display === 'granted';
}

let channelReady: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  if (nativePlatform() !== 'android') return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Daily reminders',
    description: "Your day's reviews and lessons, at the time you choose",
    importance: 3, // default: sound, no heads-up interruption
  }).catch(() => {});
  return channelReady;
}

/** Replace every pending reminder with `reminders` (an empty list just clears them) */
export async function applyReminders(reminders: Reminder[]): Promise<void> {
  if (!isNative()) return;
  const { notifications: pending } = await LocalNotifications.getPending();
  const ours = pending.filter((n) => REMINDER_IDS.includes(n.id));
  if (ours.length) await LocalNotifications.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (!reminders.length) return;
  await ensureChannel();
  await LocalNotifications.schedule({
    notifications: reminders.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      // Inexact is fine for a nudge, and avoids Android's exact-alarm permission
      schedule: { at: new Date(r.at), allowWhileIdle: true },
      channelId: CHANNEL_ID,
      smallIcon: 'ic_stat_takrar',
      iconColor: '#1B4D5C',
      extra: { url: r.url },
    })),
  });
}

/** Tapping a reminder opens its route. Returns a cleanup. */
export function onReminderTap(open: (url: string) => void): () => void {
  if (!isNative()) return () => {};
  const listener = LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
    const url = notification.extra?.url;
    if (typeof url === 'string' && url.startsWith('/')) open(url);
  });
  return () => {
    listener.then((l) => l.remove());
  };
}
