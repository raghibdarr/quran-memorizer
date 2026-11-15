// Calculation methods (all-in-one spec 3.3): adhan's named methods plus `custom`.
// The angles here are adhan's own (node_modules/adhan/METHODS.md); the labels and
// one-line explanations are ours. Pure data: no adhan import, so screens can list
// methods without loading the engine.

import type { MethodId } from '@/types/prayer';
export { isMethodId } from '@/types/prayer';

export interface MethodInfo {
  id: MethodId;
  /** Short name for lists */
  label: string;
  /** One plain sentence on who uses it */
  about: string;
  fajrAngle: number | null;
  /** Degrees, or null when Isha is a fixed interval after Maghrib */
  ishaAngle: number | null;
  /** Minutes after Maghrib, when Isha is an interval */
  ishaInterval?: number;
}

export const METHODS: readonly MethodInfo[] = [
  { id: 'MuslimWorldLeague', label: 'Muslim World League', about: 'A common default in Europe, the Far East and parts of America.', fajrAngle: 18, ishaAngle: 17 },
  { id: 'Egyptian', label: 'Egyptian General Authority', about: 'Used in Egypt and much of Africa, Syria, Iraq and Lebanon.', fajrAngle: 19.5, ishaAngle: 17.5 },
  { id: 'Karachi', label: 'University of Islamic Sciences, Karachi', about: 'Used in Pakistan, India, Bangladesh and Afghanistan.', fajrAngle: 18, ishaAngle: 18 },
  { id: 'UmmAlQura', label: 'Umm al-Qura, Makkah', about: 'Used in Saudi Arabia. Isha is 90 minutes after Maghrib.', fajrAngle: 18.5, ishaAngle: null, ishaInterval: 90 },
  { id: 'Dubai', label: 'Dubai', about: 'Used in the United Arab Emirates.', fajrAngle: 18.2, ishaAngle: 18.2 },
  { id: 'MoonsightingCommittee', label: 'Moonsighting Committee', about: 'Adjusts Fajr and Isha by season. Used by many mosques in North America and the UK.', fajrAngle: 18, ishaAngle: 18 },
  { id: 'NorthAmerica', label: 'ISNA (North America)', about: 'The Islamic Society of North America’s angles. Gives later Fajr and earlier Isha.', fajrAngle: 15, ishaAngle: 15 },
  { id: 'Kuwait', label: 'Kuwait', about: 'Used in Kuwait.', fajrAngle: 18, ishaAngle: 17.5 },
  { id: 'Qatar', label: 'Qatar', about: 'Used in Qatar. Isha is 90 minutes after Maghrib.', fajrAngle: 18, ishaAngle: null, ishaInterval: 90 },
  { id: 'Singapore', label: 'Singapore', about: 'Used in Singapore, Malaysia and Indonesia.', fajrAngle: 20, ishaAngle: 18 },
  { id: 'Tehran', label: 'Institute of Geophysics, Tehran', about: 'Used in Iran.', fajrAngle: 17.7, ishaAngle: 14 },
  { id: 'Turkey', label: 'Diyanet (Turkey)', about: 'Used in Turkey.', fajrAngle: 18, ishaAngle: 17 },
  { id: 'custom', label: 'Custom angles', about: 'Your own Fajr and Isha angles, for matching a local timetable.', fajrAngle: null, ishaAngle: null },
];

const BY_ID = new Map(METHODS.map((m) => [m.id, m]));

export function methodInfo(id: MethodId): MethodInfo {
  return BY_ID.get(id) ?? BY_ID.get('MuslimWorldLeague')!;
}

/** The named (non-custom) methods, for pickers and the match wizard */
export const NAMED_METHODS: readonly MethodId[] = METHODS.filter((m) => m.id !== 'custom').map((m) => m.id);

/** Asr positions, with the label the setup screen shows */
export const ASR_LABELS = {
  standard: "Standard (Shafi'i, Maliki, Hanbali)",
  hanafi: 'Hanafi',
} as const;
