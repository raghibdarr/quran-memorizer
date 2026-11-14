// The bundled city list (GeoNames cities15000, CC BY 4.0; built by
// scripts/build-cities.mjs into public/data/cities.json). Fetched from the app's
// own bundle only on the city-search screen and after a "Use my location" fix,
// never at startup. Search and the nearest-city label run on the device: no
// query or coordinate is ever sent anywhere.

import type { Place } from '@/types/prayer';

export interface City {
  /** Row in the file, stable for one build of it */
  id: number;
  name: string;
  /** ISO 3166-1 alpha-2, upper case */
  cc: string;
  lat: number;
  lng: number;
  tz: string;
  /** 0-9: 0 under 30,000 people, each step doubles */
  tier: number;
  /** State or province code where the file carries one (United States only: "MO") */
  admin1?: string;
}

/** The file as scripts/build-cities.mjs writes it */
export interface CitiesFile {
  v: number;
  source?: string;
  licence?: string;
  retrieved?: string;
  countries: string[];
  counts: number[];
  zones: string[];
  name: string[];
  lat: number[];
  lng: number[];
  z: number[];
  pop: string;
  ascii: Record<string, string>;
  /** Per country, one two-letter admin1 code per row of that country, concatenated */
  admin1?: Record<string, string>;
}

export interface CityIndex {
  cities: City[];
  /** Folded names (and ASCII names) per row, for search */
  keys: string[][];
}

/** Lower case, accents and apostrophe variants removed (the same fold the build uses), hyphens as spaces */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .toLowerCase()
    .replace(/[-‐–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Turns the columnar file into rows (throws on a file it can't read) */
export function decodeCities(file: CitiesFile): CityIndex {
  const n = file.name.length;
  if (file.v !== 1 || file.lat.length !== n || file.lng.length !== n || file.z.length !== n || file.pop.length !== n) {
    throw new Error('cities.json: unexpected shape');
  }
  const cities: City[] = new Array(n);
  const keys: string[][] = new Array(n);
  let lat = 0;
  let lng = 0;
  let row = 0;
  file.countries.forEach((cc, ci) => {
    const codes = file.admin1?.[cc];
    if (codes !== undefined && codes.length !== file.counts[ci] * 2) throw new Error('cities.json: admin1 does not add up');
    for (let k = 0; k < file.counts[ci]; k++, row++) {
      lat += file.lat[row];
      lng += file.lng[row];
      const name = file.name[row];
      cities[row] = { id: row, name, cc, lat: lat / 100, lng: lng / 100, tz: file.zones[file.z[row]], tier: Number(file.pop[row]) };
      if (codes) cities[row].admin1 = codes.slice(k * 2, k * 2 + 2);
      const ascii = file.ascii[String(row)];
      keys[row] = ascii ? [fold(name), fold(ascii)] : [fold(name)];
    }
  });
  if (row !== n) throw new Error('cities.json: counts do not add up');
  return { cities, keys };
}

let loading: Promise<CityIndex> | null = null;

/** Fetches and decodes the city list once per session (cached by the service worker for offline use) */
export function loadCities(): Promise<CityIndex> {
  if (!loading) {
    loading = fetch('/data/cities.json')
      .then((r) => {
        if (!r.ok) throw new Error(`cities.json: ${r.status}`);
        return r.json() as Promise<CitiesFile>;
      })
      .then(decodeCities)
      .catch((err) => {
        loading = null; // let the next attempt try again (back online)
        throw err;
      });
  }
  return loading;
}

/** Tests only */
export function resetCitiesForTests() {
  loading = null;
}

// Names people type for a few places GeoNames spells another way (our own list).
// Each maps to [GeoNames name, country].
const ALIASES: Record<string, Array<[string, string]>> = {
  mecca: [['Makkah', 'SA']],
  makka: [['Makkah', 'SA']],
  'makkah al mukarramah': [['Makkah', 'SA']],
  medina: [['Madinah', 'SA']],
  madina: [['Madinah', 'SA']],
  'al madinah': [['Madinah', 'SA']],
  'madinah al munawwarah': [['Madinah', 'SA']],
  jiddah: [['Jeddah', 'SA']],
  jedda: [['Jeddah', 'SA']],
  'al quds': [['Jerusalem', 'IL'], ['East Jerusalem', 'PS']],
  quds: [['Jerusalem', 'IL'], ['East Jerusalem', 'PS']],
  bombay: [['Mumbai', 'IN']],
  calcutta: [['Kolkata', 'IN']],
  madras: [['Chennai', 'IN']],
  dacca: [['Dhaka', 'BD']],
  constantinople: [['Istanbul', 'TR']],
};

let displayNames: Intl.DisplayNames | null | undefined;

/** "Saudi Arabia" for "SA" (the platform's own names); the code itself if it can't say */
export function countryName(cc: string): string {
  if (!cc) return '';
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

// US states (and DC) by their two-letter code: our own table, for telling apart
// the many US towns that share a name
const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
};

/** "Missouri" for a US city; '' where the list carries no state or province */
export function regionName(city: Pick<City, 'cc' | 'admin1'>): string {
  if (!city.admin1) return '';
  return city.cc === 'US' ? (US_STATES[city.admin1] ?? city.admin1) : city.admin1;
}

/** "Makkah, Saudi Arabia" */
export function cityLabel(city: Pick<City, 'name' | 'cc'>): string {
  const country = countryName(city.cc);
  return country && country !== city.name ? `${city.name}, ${country}` : city.name;
}

/** Match quality: lower is better */
const EXACT = 0;
const PREFIX = 1;
const WORD = 2;
const INSIDE = 3;

function matchRank(keys: string[], q: string): number {
  let best = Infinity;
  for (const k of keys) {
    if (k === q) return EXACT;
    if (k.startsWith(q)) best = Math.min(best, PREFIX);
    else if (k.includes(` ${q}`)) best = Math.min(best, WORD);
    else if (q.length >= 3 && k.includes(q)) best = Math.min(best, INSIDE);
  }
  return best;
}

/**
 * Cities matching what the user typed, best first: exact name, then names
 * starting with it, then a later word starting with it, then (3+ letters)
 * anywhere in the name; bigger places first within each. "London, Canada" or
 * "London CA" narrows by country.
 */
export function searchCities(index: CityIndex, query: string, limit = 8): City[] {
  let q = fold(query).replace(/[.]/g, '');
  if (!q) return [];
  let countryQ = '';
  const comma = q.indexOf(',');
  if (comma >= 0) {
    countryQ = q.slice(comma + 1).trim();
    q = q.slice(0, comma).trim();
  }
  if (!q) return [];

  const countryOk = (cc: string) => {
    if (!countryQ) return true;
    if (countryQ.length === 2 && cc.toLowerCase() === countryQ) return true;
    return fold(countryName(cc)).startsWith(countryQ);
  };

  const scored: Array<{ city: City; rank: number }> = [];
  const aliasTargets = ALIASES[q];
  if (aliasTargets) {
    for (const [name, cc] of aliasTargets) {
      const city = index.cities.find((c) => c.name === name && c.cc === cc);
      if (city && countryOk(city.cc)) scored.push({ city, rank: -1 });
    }
  }

  for (let i = 0; i < index.cities.length; i++) {
    const city = index.cities[i];
    if (aliasTargets && scored.some((s) => s.city.id === city.id)) continue;
    let rank = matchRank(index.keys[i], q);
    // "London Canada" without the comma: try the last word as a country
    if (rank === Infinity && !countryQ) {
      const sp = q.lastIndexOf(' ');
      if (sp > 0) {
        const head = q.slice(0, sp);
        const tail = q.slice(sp + 1);
        const r = matchRank(index.keys[i], head);
        if (r !== Infinity && (tail.length === 2 ? city.cc.toLowerCase() === tail : tail.length >= 3 && fold(countryName(city.cc)).startsWith(tail))) rank = r;
      }
    }
    if (rank === Infinity || !countryOk(city.cc)) continue;
    scored.push({ city, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || b.city.tier - a.city.tier || a.city.name.length - b.city.name.length || a.city.id - b.city.id);
  return scored.slice(0, limit).map((s) => s.city);
}

const RAD = Math.PI / 180;

/** Great-circle distance in km */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = (bLat - aLat) * RAD;
  const dLng = (bLng - aLng) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * RAD) * Math.cos(bLat * RAD) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The bundled city closest to a point, with how far away it is */
export function nearestCity(index: CityIndex, lat: number, lng: number): { city: City; km: number } | null {
  let best: City | null = null;
  let bestKm = Infinity;
  for (const c of index.cities) {
    // Cheap reject before the trigonometry: more than 5° of latitude away can't beat a close one
    if (bestKm < 500 && Math.abs(c.lat - lat) > 5) continue;
    const km = distanceKm(lat, lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = c;
    }
  }
  return best ? { city: best, km: bestKm } : null;
}

/** Within this distance a fix is labelled with the city's own name; further out, "Near …" */
export const NEAR_KM = 15;

const zoneOk = new Map<string, boolean>();

/** Whether this device can show times in a zone (a newer tzdata name, like America/Coyhaique, may be unknown) */
export function knownZone(tz: string): boolean {
  let ok = zoneOk.get(tz);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: tz });
      ok = true;
    } catch {
      ok = false;
    }
    zoneOk.set(tz, ok);
  }
  return ok;
}

/**
 * The city's zone, or, when this device doesn't know that name yet, the zone of
 * the nearest city it does know (a new zone splits off a neighbour, so the
 * neighbour's clock is the best stand-in)
 */
export function usableZone(index: CityIndex | null, city: Pick<City, 'tz' | 'lat' | 'lng'>): string {
  if (knownZone(city.tz) || !index) return city.tz;
  let best = '';
  let bestKm = Infinity;
  for (const c of index.cities) {
    if (c.tz === city.tz || !knownZone(c.tz)) continue;
    const km = distanceKm(city.lat, city.lng, c.lat, c.lng);
    if (km < bestKm) {
      bestKm = km;
      best = c.tz;
    }
  }
  return best || city.tz;
}

/** A place from a chosen city (its own coordinates and zone) */
export function placeFromCity(city: City, index: CityIndex | null = null): Place {
  return { lat: city.lat, lng: city.lng, label: cityLabel(city), countryCode: city.cc, tz: usableZone(index, city), source: 'city' };
}

/**
 * A place from a location fix: the user's own (rounded) coordinates, labelled
 * and zoned by the nearest bundled city. Without the list (offline on the web
 * before it was ever cached) the device's own zone is used.
 */
export function placeFromFix(
  lat: number,
  lng: number,
  near: { city: City; km: number } | null,
  deviceTz: string,
  index: CityIndex | null = null,
): Place {
  if (!near) return { lat, lng, label: 'Your location', countryCode: '', tz: deviceTz || 'UTC', source: 'gps' };
  const label = near.km <= NEAR_KM ? cityLabel(near.city) : `Near ${cityLabel(near.city)}`;
  return { lat, lng, label, countryCode: near.city.cc, tz: usableZone(index, near.city), source: 'gps' };
}
