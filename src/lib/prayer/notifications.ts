// The OS side of prayer alerts (all-in-one spec 3.6, 6): turns planPrayerAlerts()
// output into local notifications and hands them over through applyRange, which
// skips the work when nothing changed (so opening the app again and again never
// churns alarms). Also the health check's probes: notification permission,
// exact alarms, battery optimisation, what is pending, and a test alert.
//
// Android channels are immutable once created, so there is one per sound:
// prayer-default-v1, prayer-chime-v1 (res/raw/takrar_chime.wav, added by the
// android-native package) and prayer-silent-v1. iOS has no chime (a bundled
// custom sound can't be compile-checked here): 'chime' plays the system sound.
//
// Taps: every notification carries extra.url ('/prayer'); ReminderSync's
// onReminderTap listener already routes any such tap, so no second listener here.

import { LocalNotifications, type Channel, type LocalNotificationSchema } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { NOTIFY_RANGES, inRange, prayerAlertId } from '@/lib/notify/registry';
import { applyRange, forgetApplied, type ApplyResult, type NotifyDeps } from '@/lib/notify/apply';
import { AdhanHealth } from '@/lib/native-plugins';
import type { AlertMode } from '@/types/prayer';
// Types only: this module must not pull in the planner (and with it adhan)
import type { AlertPlan, AlertPlatform, PlannedAlert, PlannedTail } from './schedule';

export const PRAYER_CHANNELS = {
  default: 'prayer-default-v1',
  chime: 'prayer-chime-v1',
  silent: 'prayer-silent-v1',
} as const;

export const CHIME_SOUND = 'takrar_chime.wav';
/** iOS has no "system default" sound name in the plugin: a name that matches no file plays the default */
export const IOS_DEFAULT_SOUND = 'default';

const CHANNELS: Channel[] = [
  {
    id: PRAYER_CHANNELS.default,
    name: 'Prayer times',
    description: 'When each prayer starts, with your phone’s notification sound',
    importance: 4,
    visibility: 1,
    vibration: true,
  },
  {
    id: PRAYER_CHANNELS.chime,
    name: 'Prayer times (chime)',
    description: 'When each prayer starts, with the Takrar chime',
    importance: 4,
    visibility: 1,
    vibration: true,
    sound: CHIME_SOUND,
  },
  {
    id: PRAYER_CHANNELS.silent,
    name: 'Prayer times (silent)',
    description: 'When each prayer starts, without a sound',
    importance: 2,
    visibility: 1,
    vibration: false,
  },
];

/** Where a prayer alert's timing and sound come from */
export interface DeliveryOptions {
  platform: AlertPlatform;
  /** Android: may the app set exact alarms? false schedules inexactly (never opens settings) */
  exact: boolean;
}

/** The fields that make a notification sound the way its mode says */
export function soundFields(mode: AlertMode, platform: AlertPlatform): Pick<LocalNotificationSchema, 'channelId' | 'sound'> {
  if (platform === 'android') {
    if (mode === 'chime') return { channelId: PRAYER_CHANNELS.chime };
    if (mode === 'silent') return { channelId: PRAYER_CHANNELS.silent };
    return { channelId: PRAYER_CHANNELS.default };
  }
  // iOS: no sound field = silent; there is no chime
  return mode === 'silent' ? {} : { sound: IOS_DEFAULT_SOUND };
}

function toSchema(
  n: { id: number; at: number; title: string; body: string; url: string },
  mode: AlertMode,
  opts: DeliveryOptions,
): LocalNotificationSchema {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    // allowWhileIdle: fire in Doze. isExactNotification must follow the grant:
    // left true without it, the plugin opens the system settings screen on every schedule
    schedule: { at: new Date(n.at), allowWhileIdle: true },
    ...(opts.platform === 'android' ? { isExactNotification: opts.exact, smallIcon: 'ic_stat_takrar', iconColor: '#1B4D5C' } : {}),
    ...soundFields(mode, opts.platform),
    extra: { url: n.url },
  };
}

export function alertToNotification(alert: PlannedAlert, opts: DeliveryOptions): LocalNotificationSchema {
  return toSchema(alert, alert.mode, opts);
}

/** The tail rings at the same instant as the last alert, so it stays silent */
export function tailToNotification(tail: PlannedTail, opts: DeliveryOptions): LocalNotificationSchema {
  return toSchema(tail, 'silent', opts);
}

/** The OS seams this module uses, injectable for tests */
export interface PrayerNotifyDeps {
  platform: AlertPlatform;
  /** Passed to applyRange (getPending, cancel, schedule, hash storage) */
  apply?: NotifyDeps;
  createChannel: (channel: Channel) => Promise<void>;
  checkDisplay: () => Promise<{ display: string }>;
  requestDisplay: () => Promise<{ display: string }>;
  checkExact: () => Promise<{ exact_alarm: string }>;
  changeExact: () => Promise<{ exact_alarm: string }>;
  getPending: () => Promise<{ notifications: LocalNotificationSchema[] }>;
  schedule: (opts: { notifications: LocalNotificationSchema[] }) => Promise<unknown>;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}

function defaultDeps(): PrayerNotifyDeps {
  let storage: PrayerNotifyDeps['storage'] = null;
  try {
    storage = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    storage = null;
  }
  return {
    platform: Capacitor.getPlatform() as AlertPlatform,
    createChannel: (c) => LocalNotifications.createChannel(c),
    checkDisplay: () => LocalNotifications.checkPermissions(),
    requestDisplay: () => LocalNotifications.requestPermissions(),
    checkExact: () => LocalNotifications.checkExactNotificationSetting(),
    changeExact: () => LocalNotifications.changeExactNotificationSetting(),
    getPending: () => LocalNotifications.getPending(),
    schedule: (o) => LocalNotifications.schedule(o),
    storage,
  };
}

let channelsReady: Promise<void> | null = null;
/** Android: create the three prayer channels once per app run (creating again is harmless) */
export function ensurePrayerChannels(deps: PrayerNotifyDeps = defaultDeps()): Promise<void> {
  if (deps.platform !== 'android') return Promise.resolve();
  channelsReady ??= Promise.all(CHANNELS.map((c) => deps.createChannel(c)))
    .then(() => undefined)
    .catch(() => {
      channelsReady = null; // try again next time
    });
  return channelsReady;
}

/** For tests: forget that the channels were created */
export function resetPrayerChannels() {
  channelsReady = null;
}

// ---------- permission and health probes ----------

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export async function alertPermission(deps: PrayerNotifyDeps = defaultDeps()): Promise<PermissionState> {
  if (deps.platform === 'web') return 'unsupported';
  try {
    const { display } = await deps.checkDisplay();
    return display === 'granted' ? 'granted' : display === 'denied' ? 'denied' : 'prompt';
  } catch {
    return 'prompt';
  }
}

/** Asks the OS. Only ever from a user turning alerts on */
export async function requestAlertPermission(deps: PrayerNotifyDeps = defaultDeps()): Promise<boolean> {
  if (deps.platform === 'web') return false;
  try {
    const { display } = await deps.requestDisplay();
    return display === 'granted';
  } catch {
    return false;
  }
}

/** Android 12+: may the app set exact alarms? Other platforms: 'unsupported' (nothing to fix) */
export async function exactAlarmState(deps: PrayerNotifyDeps = defaultDeps()): Promise<'granted' | 'denied' | 'unsupported'> {
  if (deps.platform !== 'android') return 'unsupported';
  try {
    const { exact_alarm } = await deps.checkExact();
    return exact_alarm === 'granted' ? 'granted' : 'denied';
  } catch {
    // An older plugin: ask our own native helper, else assume inexact
    const v = await AdhanHealth.canScheduleExactAlarms();
    return v === true ? 'granted' : 'denied';
  }
}

/** Opens the system "Alarms and reminders" screen. True when a screen was opened */
export async function openExactAlarmSetting(deps: PrayerNotifyDeps = defaultDeps()): Promise<boolean> {
  if (deps.platform !== 'android') return false;
  try {
    await deps.changeExact();
    return true;
  } catch {
    return AdhanHealth.openExactAlarmSettings();
  }
}

/** Android, with Takrar's native helper: is battery optimisation off? null = can't tell */
export async function batteryUnrestricted(): Promise<boolean | null> {
  if (!AdhanHealth.available()) return null;
  return AdhanHealth.isIgnoringBatteryOptimizations();
}

export const openBatterySettings = () => AdhanHealth.openBatterySettings();

const atMs = (n: LocalNotificationSchema): number | null => {
  const at = n.schedule?.at as unknown;
  if (at === undefined || at === null) return null;
  const t = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(String(at));
  return Number.isFinite(t) ? t : null;
};

export interface PendingSummary {
  /** Prayer alerts waiting in the OS (the tail and a test alert not counted) */
  count: number;
  /** The latest of them, epoch ms; null when none */
  lastAt: number | null;
}

/** The test alert's slot: the planner uses 0-9 only */
export const TEST_ALERT_SLOT = 19;
export const TEST_ALERT_ID = prayerAlertId(0, TEST_ALERT_SLOT);

/** What the OS holds right now in the prayer range */
export async function pendingPrayerAlerts(deps: PrayerNotifyDeps = defaultDeps()): Promise<PendingSummary> {
  if (deps.platform === 'web') return { count: 0, lastAt: null };
  try {
    const { notifications } = await deps.getPending();
    const ours = notifications.filter((n) => inRange(n.id, NOTIFY_RANGES.prayer) && n.id !== TEST_ALERT_ID);
    const times = ours.map(atMs).filter((t): t is number => t !== null);
    return { count: ours.length, lastAt: times.length ? Math.max(...times) : null };
  } catch {
    return { count: 0, lastAt: null };
  }
}

// ---------- applying a plan ----------

/** Device-only memo of the last plan handed to the OS (no times of day, no place) */
export const ALERT_META_KEY = 'takrar-prayer-alerts-meta';

export interface AlertMeta {
  count: number;
  lastAt: number | null;
  appliedAt: number;
}

export function readAlertMeta(deps: Pick<PrayerNotifyDeps, 'storage'> = defaultDeps()): AlertMeta | null {
  try {
    const raw = deps.storage?.getItem(ALERT_META_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Partial<AlertMeta>;
    if (typeof m.count !== 'number' || typeof m.appliedAt !== 'number') return null;
    return { count: m.count, lastAt: typeof m.lastAt === 'number' ? m.lastAt : null, appliedAt: m.appliedAt };
  } catch {
    return null;
  }
}

function writeAlertMeta(deps: PrayerNotifyDeps, meta: AlertMeta | null) {
  try {
    if (meta) deps.storage?.setItem(ALERT_META_KEY, JSON.stringify(meta));
    else deps.storage?.removeItem(ALERT_META_KEY);
  } catch {
    // storage full or blocked: the memo is only for the health check
  }
}

export interface SyncResult {
  alerts: ApplyResult;
  tail: ApplyResult;
}

/**
 * Make the OS's pending prayer alerts match `plan`. Touches only ids 20000-21000
 * (the prayer range and the tail), so hifz reminders (7100+) and every other
 * feature's alerts are left alone. An empty plan clears both.
 */
export async function syncPrayerAlerts(plan: AlertPlan, deps: PrayerNotifyDeps = defaultDeps(), now = Date.now()): Promise<SyncResult> {
  if (deps.platform === 'web') return { alerts: { status: 'unsupported' }, tail: { status: 'unsupported' } };
  if (plan.alerts.length) await ensurePrayerChannels(deps);
  const exact = deps.platform === 'android' && plan.alerts.length ? (await exactAlarmState(deps)) === 'granted' : false;
  const opts: DeliveryOptions = { platform: deps.platform, exact };
  const alerts = await applyRange(NOTIFY_RANGES.prayer, plan.alerts.map((a) => alertToNotification(a, opts)), deps.apply);
  const tail = await applyRange(NOTIFY_RANGES.prayerTail, plan.tail ? [tailToNotification(plan.tail, opts)] : [], deps.apply);
  if (alerts.status === 'applied') {
    writeAlertMeta(deps, plan.alerts.length
      ? { count: plan.alerts.length, lastAt: plan.alerts[plan.alerts.length - 1].at, appliedAt: now }
      : null);
  }
  return { alerts, tail };
}

let orphansChecked = false;
/** For tests: look for left-behind alerts again */
export function resetOrphanCheck() {
  orphansChecked = false;
}

/**
 * Clear every prayer alert. With a memo of a handed-over plan it clears at once.
 * Without one it asks the OS what is pending, once per app run: "Erase everything
 * on this device" wipes the memo and the settings but not the alarms the OS
 * holds, and those would otherwise keep ringing for up to 30 days with every
 * prayer shown as off. After that one look, no OS calls.
 */
export async function clearPrayerAlerts(deps: PrayerNotifyDeps = defaultDeps()): Promise<boolean> {
  if (deps.platform === 'web') return false;
  if (!readAlertMeta(deps)) {
    if (orphansChecked) return false;
    const { notifications } = await deps.getPending();
    orphansChecked = true;
    const left = notifications.some(
      (n) => n.id !== TEST_ALERT_ID && (inRange(n.id, NOTIFY_RANGES.prayer) || inRange(n.id, NOTIFY_RANGES.prayerTail)),
    );
    if (!left) return false;
    // The stored hash may say "already empty": make the clear really run
    forcePrayerResync(deps.apply);
  }
  await syncPrayerAlerts({ alerts: [], tail: null, days: 0 }, deps);
  writeAlertMeta(deps, null);
  return true;
}

/** Make the next sync schedule even if the plan looks unchanged (after a permission or exact-alarm grant) */
export function forcePrayerResync(deps?: Pick<NotifyDeps, 'setHash'>) {
  forgetApplied(NOTIFY_RANGES.prayer, deps);
  forgetApplied(NOTIFY_RANGES.prayerTail, deps);
}

/** One alert in 10 seconds, sounding like `mode`. Its id is a spare slot no plan uses */
export async function sendTestAlert(mode: AlertMode, deps: PrayerNotifyDeps = defaultDeps(), now = Date.now()): Promise<boolean> {
  if (deps.platform === 'web') return false;
  try {
    await ensurePrayerChannels(deps);
    const exact = (await exactAlarmState(deps)) === 'granted';
    const sound = mode === 'off' ? 'default' : mode;
    await deps.schedule({
      notifications: [
        toSchema(
          { id: TEST_ALERT_ID, at: now + 10_000, title: 'Test alert', body: 'This is how prayer alerts will look and sound.', url: '/prayer/alerts' },
          sound,
          { platform: deps.platform, exact },
        ),
      ],
    });
    return true;
  } catch {
    return false;
  }
}
