// Local-notification ID ranges and the iOS budget (all-in-one spec 3.6). Every
// feature that schedules notifications owns one range and only ever cancels
// inside it, so features can't wipe each other's alerts. iOS keeps at most 64
// pending local notifications per app; the slots below add up to exactly 64.

export interface NotifyRange {
  name: NotifyRangeName;
  /** First id, inclusive */
  start: number;
  /** Last id, inclusive */
  end: number;
  /** How many may be pending at once on iOS */
  iosSlots: number;
}

export type NotifyRangeName = 'hifz' | 'prayer' | 'prayerTail' | 'adhkar' | 'reminders';

export const NOTIFY_RANGES: Readonly<Record<NotifyRangeName, NotifyRange>> = {
  /** The existing hifz reminders (src/lib/reminders.ts, REMINDER_ID_BASE 7100); untouched */
  hifz: { name: 'hifz', start: 7100, end: 7119, iosSlots: 9 },
  /** Prayer alerts: 20000 + dayIndex * 20 + slot */
  prayer: { name: 'prayer', start: 20000, end: 20999, iosSlots: 48 },
  /** "Open Takrar to keep prayer alerts coming", after the last scheduled alert */
  prayerTail: { name: 'prayerTail', start: 21000, end: 21000, iosSlots: 1 },
  /** Morning and evening adhkar (repeating daily) */
  adhkar: { name: 'adhkar', start: 22000, end: 22009, iosSlots: 2 },
  /** Hawl date, optional fasting reminders */
  reminders: { name: 'reminders', start: 22100, end: 22109, iosSlots: 4 },
};

export const IOS_PENDING_LIMIT = 64;

/** Per-day slots in the prayer range: 5 prayers, 5 pre-alerts, room to grow */
export const PRAYER_SLOTS_PER_DAY = 20;
/** Days the prayer range can hold (20000..20999) */
export const PRAYER_MAX_DAYS = 50;
/** How far ahead Android schedules prayer alerts */
export const ANDROID_PRAYER_HORIZON_DAYS = 30;

/** The id of a prayer alert: day 0 is the first scheduled day */
export function prayerAlertId(dayIndex: number, slot: number): number {
  if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex >= PRAYER_MAX_DAYS) throw new RangeError(`dayIndex ${dayIndex} out of range`);
  if (!Number.isInteger(slot) || slot < 0 || slot >= PRAYER_SLOTS_PER_DAY) throw new RangeError(`slot ${slot} out of range`);
  return NOTIFY_RANGES.prayer.start + dayIndex * PRAYER_SLOTS_PER_DAY + slot;
}

export const PRAYER_TAIL_ID = NOTIFY_RANGES.prayerTail.start;

export function inRange(id: number, range: NotifyRange): boolean {
  return id >= range.start && id <= range.end;
}

/** The range an id belongs to, or null */
export function rangeOf(id: number): NotifyRange | null {
  return Object.values(NOTIFY_RANGES).find((r) => inRange(id, r)) ?? null;
}

/** How many notifications a range may schedule on a platform */
export function budgetFor(range: NotifyRange, platform: 'ios' | 'android' | 'web'): number {
  if (platform === 'web') return 0;
  if (platform === 'ios') return range.iosSlots;
  return range.end - range.start + 1;
}

/** iOS: as many whole days of prayer alerts as fit in the slots, given alerts per day */
export function iosPrayerDays(alertsPerDay: number): number {
  if (alertsPerDay <= 0) return 0;
  return Math.floor(NOTIFY_RANGES.prayer.iosSlots / alertsPerDay);
}
