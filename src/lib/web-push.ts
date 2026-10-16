'use client';

/**
 * Web reminders (M8): browser push subscriptions and the weekly email preference,
 * stored in Supabase (migration 003) for the Netlify senders. The phone apps use
 * local notifications instead (reminder-store), so none of this runs natively.
 */
import { createClient } from '@/lib/supabase/client';
import { isNative } from '@/lib/native';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export type PushAvailability = 'ok' | 'unsupported' | 'install-first' | 'not-configured';

export function pushAvailability(): PushAvailability {
  if (typeof window === 'undefined' || isNative()) return 'unsupported';
  if (!VAPID_PUBLIC_KEY) return 'not-configured';
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  // iPhone/iPad Safari only allows push for a site added to the Home Screen (iOS 16.4+)
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
  if (ios && !standalone) return 'install-first';
  return supported ? 'ok' : 'unsupported';
}

function keyBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function userId(): Promise<string | null> {
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

/** This browser's reminder, if any: { hour } */
export async function getPushReminder(): Promise<{ hour: number } | null> {
  if (pushAvailability() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const { data } = await createClient().from('push_subscriptions').select('reminder_hour').eq('endpoint', sub.endpoint).maybeSingle();
  return data ? { hour: data.reminder_hour as number } : null;
}

/** Ask for permission, subscribe this browser and save it with the chosen local hour */
export async function enablePushReminder(hour: number): Promise<'ok' | 'denied' | 'signed-out' | 'failed'> {
  const uid = await userId();
  if (!uid) return 'signed-out';
  if ((await Notification.requestPermission()) !== 'granted') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription())
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY!) as BufferSource });
    const json = sub.toJSON();
    const { error } = await createClient().from('push_subscriptions').upsert({
      endpoint: sub.endpoint, user_id: uid, p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '', tz: tz(), reminder_hour: hour,
    });
    return error ? 'failed' : 'ok';
  } catch {
    return 'failed';
  }
}

export async function setPushReminderHour(hour: number): Promise<boolean> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return false;
  const { error } = await createClient().from('push_subscriptions').update({ reminder_hour: hour, tz: tz() }).eq('endpoint', sub.endpoint);
  return !error;
}

export async function disablePushReminder(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await createClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => {});
}

/** The weekly email preference (opt-in) */
export async function getEmailDigest(): Promise<boolean> {
  const uid = await userId();
  if (!uid) return false;
  const { data } = await createClient().from('notification_prefs').select('email_digest').eq('user_id', uid).maybeSingle();
  return !!data?.email_digest;
}

export async function setEmailDigest(on: boolean): Promise<boolean> {
  const uid = await userId();
  if (!uid) return false;
  const { error } = await createClient().from('notification_prefs').upsert({ user_id: uid, email_digest: on, tz: tz(), updated_at: new Date().toISOString() });
  return !error;
}
