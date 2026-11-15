// Morning and evening adhkar reminders (all-in-one spec 3.6): two repeating daily
// local notifications, ids 22000 (morning) and 22001 (evening), off by default,
// native only. The choice is a device setting (it schedules this phone's alerts),
// kept in localStorage like the other per-device switches.

import type { LocalNotificationSchema } from '@capacitor/local-notifications';
import { NOTIFY_RANGES } from '@/lib/notify/registry';

export const ADHKAR_REMINDER_KEY = 'takrar-adhkar-reminders';
export const MORNING_REMINDER_ID = NOTIFY_RANGES.adhkar.start; // 22000
export const EVENING_REMINDER_ID = NOTIFY_RANGES.adhkar.start + 1; // 22001
export const ADHKAR_CHANNEL_ID = 'adhkar-v1';

export interface ReminderSlot {
  on: boolean;
  /** "HH:MM", 24-hour, device time */
  time: string;
}

export interface AdhkarReminders {
  morning: ReminderSlot;
  evening: ReminderSlot;
}

export const DEFAULT_REMINDERS: AdhkarReminders = {
  morning: { on: false, time: '06:30' },
  evening: { on: false, time: '17:30' },
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

function cleanSlot(raw: unknown, fallback: ReminderSlot): ReminderSlot {
  const s = (raw ?? {}) as Partial<ReminderSlot>;
  return { on: s.on === true, time: typeof s.time === 'string' && TIME.test(s.time) ? s.time : fallback.time };
}

export function parseReminders(raw: string | null): AdhkarReminders {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<AdhkarReminders>) : {};
    return { morning: cleanSlot(v.morning, DEFAULT_REMINDERS.morning), evening: cleanSlot(v.evening, DEFAULT_REMINDERS.evening) };
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function readReminders(): AdhkarReminders {
  try {
    return parseReminders(localStorage.getItem(ADHKAR_REMINDER_KEY));
  } catch {
    return DEFAULT_REMINDERS;
  }
}

export function writeReminders(r: AdhkarReminders) {
  try {
    localStorage.setItem(ADHKAR_REMINDER_KEY, JSON.stringify(r));
  } catch {
    /* private mode: the switch lasts for this visit */
  }
}

/** The repeating notifications the settings ask for (none when both are off) */
export function planAdhkarReminders(r: AdhkarReminders): LocalNotificationSchema[] {
  const out: LocalNotificationSchema[] = [];
  const add = (id: number, slot: ReminderSlot, title: string, body: string, set: string) => {
    if (!slot.on) return;
    const [, h, m] = slot.time.match(TIME)!;
    out.push({
      id,
      title,
      body,
      // Repeats every day at this time; inexact is fine for a nudge
      schedule: { on: { hour: Number(h), minute: Number(m) }, allowWhileIdle: true },
      // Android: never open the exact-alarm settings screen for a daily nudge
      isExactNotification: false,
      channelId: ADHKAR_CHANNEL_ID,
      smallIcon: 'ic_stat_takrar',
      iconColor: '#1B4D5C',
      extra: { url: `/adhkar/now?set=${set}` },
    });
  };
  add(MORNING_REMINDER_ID, r.morning, 'Morning adhkar', 'A few minutes of remembrance to start the day.', 'morning');
  add(EVENING_REMINDER_ID, r.evening, 'Evening adhkar', 'A few minutes of remembrance as the day ends.', 'evening');
  return out;
}
