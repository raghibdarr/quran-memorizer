// Default calculation per country (all-in-one spec 3.3): our own table, built
// from where each method is commonly used (adhan's METHODS.md notes plus each
// authority's own country). A default only: setup shows the reason in one
// sentence and the user can change it, or let Match my mosque fit it.

import type { AsrMadhab, MethodId } from '@/types/prayer';

export interface RegionDefault {
  method: MethodId;
  madhab: AsrMadhab;
  /** One sentence the setup screen shows under the choice */
  reason: string;
}

const row = (method: MethodId, madhab: AsrMadhab, reason: string): RegionDefault => ({ method, madhab, reason });

const SOUTH_ASIA = (country: string) =>
  row('Karachi', 'hanafi', `Most mosques in ${country} use the Karachi angles, with the Hanafi time for Asr.`);
const SOUTH_EAST_ASIA = (country: string) =>
  row('Singapore', 'standard', `The Singapore angles match the official timetables used in ${country}.`);
const EGYPTIAN = (country: string) =>
  row('Egyptian', 'standard', `The Egyptian General Authority's angles are widely used in ${country}.`);
const MOONSIGHTING = (country: string) =>
  row('MoonsightingCommittee', 'standard', `Many mosques in ${country} use the Moonsighting Committee times, which adjust Fajr and Isha by season.`);

export const REGION_DEFAULTS: Readonly<Record<string, RegionDefault>> = {
  SA: row('UmmAlQura', 'standard', 'Saudi Arabia’s official times use the Umm al-Qura method.'),
  AE: row('Dubai', 'standard', 'This is the method used for official times in the UAE.'),
  QA: row('Qatar', 'standard', 'This is the method used for official times in Qatar.'),
  KW: row('Kuwait', 'standard', 'This is the method used for official times in Kuwait.'),
  IR: row('Tehran', 'standard', 'The Tehran Institute of Geophysics method is the one used in Iran.'),
  TR: row('Turkey', 'standard', 'This follows the Diyanet times used across Turkey.'),
  EG: EGYPTIAN('Egypt'),
  SD: EGYPTIAN('Sudan'),
  SY: EGYPTIAN('Syria'),
  IQ: EGYPTIAN('Iraq'),
  LB: EGYPTIAN('Lebanon'),
  PK: SOUTH_ASIA('Pakistan'),
  IN: SOUTH_ASIA('India'),
  BD: SOUTH_ASIA('Bangladesh'),
  AF: SOUTH_ASIA('Afghanistan'),
  SG: SOUTH_EAST_ASIA('Singapore'),
  MY: SOUTH_EAST_ASIA('Malaysia'),
  ID: SOUTH_EAST_ASIA('Indonesia'),
  BN: SOUTH_EAST_ASIA('Brunei'),
  US: MOONSIGHTING('the United States'),
  CA: MOONSIGHTING('Canada'),
  GB: MOONSIGHTING('the UK'),
};

export const FALLBACK_DEFAULT: RegionDefault = row(
  'MuslimWorldLeague',
  'standard',
  'The Muslim World League angles are a common default. If your mosque’s times differ, match them in settings.',
);

/** The default method and Asr position for a country code ('' or unknown → Muslim World League) */
export function regionDefault(countryCode: string | null | undefined): RegionDefault {
  return REGION_DEFAULTS[(countryCode ?? '').toUpperCase()] ?? FALLBACK_DEFAULT;
}
