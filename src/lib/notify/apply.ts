// Hands a feature's planned notifications to the OS (all-in-one spec 3.3 / 3.6).
// Each call owns one ID range: it cancels what is pending in that range and
// schedules the new set, and it does nothing at all when the set is the same as
// the last one applied (replans run on every mount, foreground and settings
// change, so most of them are no-ops).

import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { canonicalJson } from '@/lib/sync/local';
import { budgetFor, inRange, type NotifyRange } from './registry';

export type Platform = 'ios' | 'android' | 'web';

/** The OS and storage seams, injectable for tests */
export interface NotifyDeps {
  platform: Platform;
  getPending: () => Promise<{ notifications: { id: number }[] }>;
  cancel: (opts: { notifications: { id: number }[] }) => Promise<void>;
  schedule: (opts: { notifications: LocalNotificationSchema[] }) => Promise<unknown>;
  getHash: (key: string) => string | null;
  setHash: (key: string, value: string | null) => void;
}

export type ApplyResult =
  | { status: 'unsupported' }
  | { status: 'unchanged' }
  | { status: 'applied'; scheduled: number; cancelled: number; dropped: number };

const hashKey = (range: NotifyRange) => `notify-hash:${range.name}`;

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** A stable hash of a notification set (order-independent; Dates compared by instant) */
export function hashNotifications(notifications: LocalNotificationSchema[]): string {
  const plain = JSON.parse(JSON.stringify([...notifications].sort((a, b) => a.id - b.id)));
  return djb2(canonicalJson(plain));
}

const atOf = (n: LocalNotificationSchema): number => {
  const at = n.schedule?.at;
  return at ? new Date(at).getTime() : Number.MAX_SAFE_INTEGER;
};

function defaultDeps(): NotifyDeps {
  const storage = (() => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  })();
  return {
    platform: Capacitor.getPlatform() as Platform,
    getPending: () => LocalNotifications.getPending(),
    cancel: (opts) => LocalNotifications.cancel(opts),
    schedule: (opts) => LocalNotifications.schedule(opts),
    getHash: (key) => storage?.getItem(key) ?? null,
    setHash: (key, value) => {
      if (!storage) return;
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    },
  };
}

/**
 * Make the OS's pending notifications in `range` equal `notifications`.
 * Ids outside the range are a programming error (throws). More than the
 * platform's budget for the range keeps the earliest ones. An empty list clears
 * the range. Skipped entirely when nothing changed since the last apply.
 */
export async function applyRange(
  range: NotifyRange,
  notifications: LocalNotificationSchema[],
  deps: NotifyDeps = defaultDeps(),
): Promise<ApplyResult> {
  if (deps.platform === 'web') return { status: 'unsupported' };
  for (const n of notifications) {
    if (!inRange(n.id, range)) throw new RangeError(`Notification id ${n.id} is outside the ${range.name} range`);
  }
  const budget = budgetFor(range, deps.platform);
  const kept = [...notifications].sort((a, b) => atOf(a) - atOf(b)).slice(0, budget);
  const hash = hashNotifications(kept);
  if (deps.getHash(hashKey(range)) === hash) return { status: 'unchanged' };

  const { notifications: pending } = await deps.getPending();
  const ours = pending.filter((n) => inRange(n.id, range));
  if (ours.length) await deps.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (kept.length) await deps.schedule({ notifications: kept });
  deps.setHash(hashKey(range), hash);
  return { status: 'applied', scheduled: kept.length, cancelled: ours.length, dropped: notifications.length - kept.length };
}

/** Forget the last applied set, so the next applyRange schedules even if unchanged
 *  (after a permission grant, or when the OS may have dropped alerts) */
export function forgetApplied(range: NotifyRange, deps: Pick<NotifyDeps, 'setHash'> = defaultDeps()) {
  deps.setHash(hashKey(range), null);
}
