'use client';

import { useEffect, useState } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { applyRange } from '@/lib/notify/apply';
import { NOTIFY_RANGES } from '@/lib/notify/registry';
import { isNative, nativePlatform } from '@/lib/native';
import { cn } from '@/lib/cn';
import { ADHKAR_CHANNEL_ID, planAdhkarReminders, readReminders, writeReminders, type AdhkarReminders } from './reminders';

let channelReady: Promise<void> | null = null;
function ensureChannel(): Promise<void> {
  if (nativePlatform() !== 'android') return Promise.resolve();
  channelReady ??= LocalNotifications.createChannel({
    id: ADHKAR_CHANNEL_ID,
    name: 'Adhkar reminders',
    description: 'Morning and evening adhkar, at the times you choose',
    importance: 3,
  }).catch(() => {});
  return channelReady;
}

async function apply(r: AdhkarReminders) {
  await ensureChannel();
  await applyRange(NOTIFY_RANGES.adhkar, planAdhkarReminders(r)).catch(() => {});
}

/**
 * Morning and evening reminders on /adhkar: off until the user turns one on,
 * which is when the OS is asked for permission. Native only; the web says so.
 */
export default function ReminderSwitches() {
  const [native] = useState(() => (typeof window === 'undefined' ? false : isNative()));
  const [r, setR] = useState<AdhkarReminders>(readReminders);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!native) return;
    // Keep the OS in step with the saved choice (a no-op when nothing changed)
    if (r.morning.on || r.evening.on) void apply(r);
  }, [native, r]);

  if (!native) {
    return (
      <p className="px-1 text-xs leading-relaxed text-muted" data-adhkar-reminders="web">
        Morning and evening reminders need the app. Everything else works here.
      </p>
    );
  }

  const update = async (next: AdhkarReminders, turnedOn: boolean) => {
    if (turnedOn) {
      const { display } = await LocalNotifications.requestPermissions().catch(() => ({ display: 'denied' as const }));
      if (display !== 'granted') {
        setDenied(true);
        return;
      }
    }
    setDenied(false);
    setR(next);
    writeReminders(next);
    await apply(next);
  };

  const row = (key: 'morning' | 'evening', label: string) => {
    const slot = r[key];
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 py-2">
        <label className="flex flex-1 items-center gap-3" htmlFor={`adhkar-${key}`}>
          <span className="text-sm font-medium text-foreground">{label}</span>
        </label>
        <input
          type="time"
          aria-label={`${label} time`}
          value={slot.time}
          disabled={!slot.on}
          onChange={(e) => e.target.value && void update({ ...r, [key]: { ...slot, time: e.target.value } }, false)}
          className="min-h-11 rounded-lg border border-foreground/15 bg-card px-2 text-sm text-foreground disabled:opacity-40"
        />
        <button
          id={`adhkar-${key}`}
          type="button"
          role="switch"
          aria-checked={slot.on}
          onClick={() => void update({ ...r, [key]: { ...slot, on: !slot.on } }, !slot.on)}
          className={cn('relative h-7 w-12 shrink-0 rounded-full transition-colors motion-reduce:transition-none', slot.on ? 'bg-teal' : 'bg-foreground/20')}
        >
          {/* The same switch as prayer settings (calc-controls): the thumb sits in the flow, left-aligned */}
          <span
            className={cn(
              'block h-6 w-6 rounded-full bg-white shadow transition-transform duration-300 ease-[cubic-bezier(.34,1.45,.64,1)] motion-reduce:transition-none',
              slot.on ? 'translate-x-5.5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
    );
  };

  return (
    <div className="divide-y divide-foreground/10 rounded-2xl border border-foreground/10 bg-card px-4" data-adhkar-reminders="native">
      {row('morning', 'Morning reminder')}
      {row('evening', 'Evening reminder')}
      {denied && <p className="py-2.5 text-xs text-muted">Notifications are off for Takrar. You can turn them on in your phone&rsquo;s settings.</p>}
    </div>
  );
}
