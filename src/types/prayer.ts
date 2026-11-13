// Shared prayer-time types (all-in-one spec 3.2 / 3.3). Stores and libs both
// import from here so neither depends on the other.

/** The five daily prayers */
export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';
/** The six times a day shows: the five prayers plus sunrise (the end of Fajr) */
export type TimeName = 'fajr' | 'sunrise' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export const PRAYER_NAMES: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
export const TIME_NAMES: readonly TimeName[] = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];

export const TIME_LABELS: Record<TimeName, string> = {
  fajr: 'Fajr',
  sunrise: 'Sunrise',
  dhuhr: 'Dhuhr',
  asr: 'Asr',
  maghrib: 'Maghrib',
  isha: 'Isha',
};

/**
 * Where the user is. Device-only (takrar-place): never synced, never in a
 * backup, a URL or a request. Coordinates are rounded to 2 decimal places.
 */
export interface Place {
  lat: number;
  lng: number;
  label: string;
  /** ISO 3166-1 alpha-2, upper case ('GB'); '' when unknown */
  countryCode: string;
  /** IANA time zone of the place ('Europe/London'): every time is shown in it */
  tz: string;
  source: 'gps' | 'city';
}

/** adhan's calculation methods, plus our own angles */
export type MethodId =
  | 'MuslimWorldLeague'
  | 'Egyptian'
  | 'Karachi'
  | 'UmmAlQura'
  | 'Dubai'
  | 'MoonsightingCommittee'
  | 'NorthAmerica'
  | 'Kuwait'
  | 'Qatar'
  | 'Singapore'
  | 'Tehran'
  | 'Turkey'
  | 'custom';

/** Asr position: standard (Shafi'i, Maliki, Hanbali) or Hanafi */
export type AsrMadhab = 'standard' | 'hanafi';

/** 'auto' takes adhan's recommendation for the latitude */
export type HighLatRule = 'auto' | 'middleofthenight' | 'seventhofthenight' | 'twilightangle';

/** Minutes added to each computed time (applied last) */
export type PrayerOffsets = Record<TimeName, number>;

export interface CustomAngles {
  fajr: number;
  /** Degrees below the horizon; ignored when ishaInterval is set */
  isha: number;
  /** Minutes after Maghrib instead of an angle (Umm al-Qura style) */
  ishaInterval?: number;
}

/** What the engine needs to compute a day (a subset of the prayer store) */
export interface PrayerCalcSettings {
  method: MethodId;
  madhab: AsrMadhab;
  highLatRule: HighLatRule;
  offsets: PrayerOffsets;
  customAngles?: CustomAngles;
}

/** A string so a recorded adhan can be added later without a migration */
export type AlertMode = 'off' | 'silent' | 'default' | 'chime';

export interface PrayerAlert {
  mode: AlertMode;
  /** Minutes before the time for an extra heads-up; 0 = none */
  preAlertMin: number;
}

export type RamadanMode = 'auto' | 'on' | 'off';
