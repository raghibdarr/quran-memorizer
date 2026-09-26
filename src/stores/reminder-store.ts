'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReminderTime } from '@/lib/reminders';
import { requestReminderPermission } from '@/lib/reminder-notifications';

/** Default when the user first turns reminders on — changeable in Settings */
export const DEFAULT_REMINDER_TIME: ReminderTime = { hour: 19, minute: 0 };

interface ReminderPrefs {
  enabled: boolean;
  time: ReminderTime;
  /** The earned-moment offer (day complete) was answered — never ask again */
  offerAnswered: boolean;
  setEnabled: (enabled: boolean) => void;
  setTime: (time: ReminderTime) => void;
  answerOffer: () => void;
}

/**
 * Daily reminder preference (M8). Per DEVICE — it controls this phone's
 * notifications — so it's deliberately not one of the synced stores.
 */
export const useReminderStore = create<ReminderPrefs>()(
  persist(
    (set) => ({
      enabled: false,
      time: DEFAULT_REMINDER_TIME,
      offerAnswered: false,
      setEnabled: (enabled) => set({ enabled }),
      setTime: (time) => set({ time }),
      answerOffer: () => set({ offerAnswered: true }),
    }),
    { name: 'reminder-prefs', version: 1 },
  ),
);

/** Ask the OS (from a user gesture) and switch reminders on if allowed */
export async function turnOnReminders(): Promise<'on' | 'blocked'> {
  if (!(await requestReminderPermission())) return 'blocked';
  useReminderStore.getState().setEnabled(true);
  return 'on';
}
