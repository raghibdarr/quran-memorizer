// Typed handles for Takrar's own native plugins (all-in-one spec 3.3). Each is
// behind Capacitor.isPluginAvailable: on the web, or in an app build that
// predates the plugin, every call resolves to a safe "unknown" answer instead of
// throwing. The Java side lives in android/ (android-native package).

import { Capacitor, registerPlugin } from '@capacitor/core';

// ---------- AdhanHealth: what stands between a prayer alert and the user ----------

export interface AdhanHealthPlugin {
  /** Android: is the app exempt from battery optimisation (alerts arrive on time)? */
  isIgnoringBatteryOptimizations(): Promise<{ value: boolean }>;
  /** Opens the system screen to exempt the app */
  openBatterySettings(): Promise<void>;
  /** Android 12+: can the app schedule exact alarms? */
  canScheduleExactAlarms?(): Promise<{ value: boolean }>;
  /** Opens the system "Alarms and reminders" screen for the app */
  openExactAlarmSettings(): Promise<void>;
}

// Registered on first use: registering the same name twice logs a warning, and
// widget-sync.tsx may register TakrarWidget itself
let adhanHealth: AdhanHealthPlugin | null = null;
const native = () => (adhanHealth ??= registerPlugin<AdhanHealthPlugin>('AdhanHealth'));

const hasAdhanHealth = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AdhanHealth');

/** null = can't tell (web, iOS, or an older app build) */
export const AdhanHealth = {
  available: hasAdhanHealth,
  async isIgnoringBatteryOptimizations(): Promise<boolean | null> {
    if (!hasAdhanHealth()) return null;
    try {
      return (await native().isIgnoringBatteryOptimizations()).value;
    } catch {
      return null;
    }
  },
  async canScheduleExactAlarms(): Promise<boolean | null> {
    if (!hasAdhanHealth()) return null;
    try {
      // An older plugin build rejects the unknown method: the catch answers "can't tell"
      const plugin = native();
      return plugin.canScheduleExactAlarms ? (await plugin.canScheduleExactAlarms()).value : null;
    } catch {
      return null;
    }
  },
  async openBatterySettings(): Promise<boolean> {
    if (!hasAdhanHealth()) return false;
    try {
      await native().openBatterySettings();
      return true;
    } catch {
      return false;
    }
  },
  async openExactAlarmSettings(): Promise<boolean> {
    if (!hasAdhanHealth()) return false;
    try {
      await native().openExactAlarmSettings();
      return true;
    } catch {
      return false;
    }
  },
};

// ---------- TakrarWidget v2: the home-screen widget ----------

export interface TakrarWidgetData {
  /** Due reviews per local day (YYYY-MM-DD) */
  due: Record<string, number>;
  streak: number;
  khatm: string;
  /** v2: the next days' prayers in time order (from prayerWidgetPayload); absent = no place set */
  prayers?: { name: string; at: number }[];
}

export interface TakrarWidgetPlugin {
  update(data: TakrarWidgetData): Promise<void>;
}

let takrarWidget: TakrarWidgetPlugin | null = null;
const widget = () => (takrarWidget ??= registerPlugin<TakrarWidgetPlugin>('TakrarWidget'));

export const TakrarWidget = {
  available: () => Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('TakrarWidget'),
  /** Resolves false when there is no widget plugin to talk to */
  async update(data: TakrarWidgetData): Promise<boolean> {
    if (!TakrarWidget.available()) return false;
    try {
      await widget().update(data);
      return true;
    } catch {
      return false;
    }
  },
};
