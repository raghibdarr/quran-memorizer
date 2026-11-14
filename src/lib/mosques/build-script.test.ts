import { describe, expect, it } from 'vitest';
import * as build from '../../../scripts/build-mosques.mjs';
import { OSM_ATTRIBUTION, PACK_VERSION, validatePack } from './pack';

// The build-time pipeline's pure parts (scripts/build-mosques.mjs). The network
// parts run only when a maintainer rebuilds the packs.

const CSV = [
  '@type\t@id\t@lat\t@lon\tname\tname:ar\tname:en',
  'node\t1\t51.51943\t-0.06512\tEast London Mosque\tمسجد شرق لندن\tEast London Mosque',
  'way\t2\t51.51944\t-0.06514\tEast London Mosque\t\t',
  'node\t1\t51.51943\t-0.06512\tEast London Mosque\t\t',
  'node\t3\t\t\tNo position\t\t',
  'node\t4\t52.0\t-1.0\tStray\ttab\there\textra',
  'relation\t5\t53.4808\t-2.2426\t  Manchester   Central  \t\t',
  'node\t6\t-33.86\t151.2\t\t\t',
].join('\n');

describe('parseOverpassCsv', () => {
  it('keeps one row per OSM feature with a position, and counts the rest as skipped', () => {
    const { rows, skipped } = build.parseOverpassCsv(CSV);
    expect(rows).toHaveLength(4);
    expect(skipped).toBe(2);
    expect(rows[2]).toEqual([53.4808, -2.2426, 'Manchester Central', '', '']);
  });

  it('refuses an answer that is not Overpass CSV', () => {
    expect(() => build.parseOverpassCsv('<html>rate limited</html>')).toThrow();
  });
});

describe('compactRows and packJson', () => {
  const { rows } = build.parseOverpassCsv(CSV);
  const entries = build.compactRows(rows);

  it('rounds to 4 decimals, drops repeated names and duplicate cells, sorts by latitude', () => {
    expect(entries).toEqual([
      [-33.86, 151.2],
      [51.5194, -0.0651, 'East London Mosque', 'مسجد شرق لندن'],
      [53.4808, -2.2426, 'Manchester Central'],
    ]);
  });

  it('writes a pack the app accepts', () => {
    const json = JSON.parse(build.packJson('GB', '2026-11-14', entries));
    expect(json.v).toBe(PACK_VERSION);
    expect(json.attribution).toBe(OSM_ATTRIBUTION);
    expect(build.ATTRIBUTION).toBe(OSM_ATTRIBUTION);
    expect(validatePack(json, 'GB')).toEqual([]);
    expect(build.validatePack(json, 'GB')).toEqual([]);
    expect(JSON.parse(build.packJson('XK', '2026-11-14', [])).m).toEqual([]);
  });

  it('asks Overpass for mosques only, and for no personal or extra fields', () => {
    expect(build.OVERPASS_QUERY).toContain('["amenity"="place_of_worship"]["religion"="muslim"]');
    expect(build.OVERPASS_QUERY).toContain('name:ar');
    expect(build.OVERPASS_QUERY).not.toMatch(/addr|phone|website|opening_hours/);
  });

  it('the per-country fallback asks for one country boundary and only checked codes', () => {
    expect(build.countryQuery('GB')).toContain('area["ISO3166-1"="GB"]["admin_level"="2"]');
    expect(build.countryQuery('GB')).toContain('["amenity"="place_of_worship"]["religion"="muslim"](area.a)');
    expect(() => build.countryQuery('G"]; out;')).toThrow();
  });
});

describe('countries', () => {
  // Two squares side by side, one with a hole, and France with Réunion inside its box
  const geo = {
    features: [
      { properties: { ISO_A2_EH: 'AA', ISO_A2: 'AA', NAME: 'A' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] } },
      { properties: { ISO_A2_EH: '-99', ISO_A2: '-99', NAME: 'Somaliland' }, geometry: { type: 'Polygon', coordinates: [[[10, 0], [20, 0], [20, 10], [10, 10], [10, 0]]] } },
      { properties: { ISO_A2_EH: 'FR', ISO_A2: 'FR', NAME: 'France' }, geometry: { type: 'MultiPolygon', coordinates: [[[[55.1, -21.5], [56, -21.5], [56, -20.8], [55.1, -20.8], [55.1, -21.5]]]] } },
    ],
  };
  const polys = build.loadCountryPolygons(geo);

  it('point in polygon, holes, codeless units and French overseas departments', () => {
    expect(build.countryAt(polys, 2, 2)).toBe('AA');
    expect(build.countryAt(polys, 5, 5)).toBeNull();
    expect(build.countryAt(polys, 5, 15)).toBe('SO');
    expect(build.countryAt(polys, -21.1, 55.5)).toBe('RE');
    expect(build.countryAt(polys, 50, 50)).toBeNull();
  });

  it('a point just offshore takes its nearest neighbour within 25 km, else none', () => {
    const rows = [
      [9.9, 9.9],
      [10.05, 9.9], // about 17 km north of the coast
      [30, 30],
    ];
    const { cc, rescued, lost } = build.assignCountries(rows, polys);
    expect(cc).toEqual(['AA', 'AA', null]);
    expect(rescued).toBe(1);
    expect(lost).toBe(1);
  });
});

describe('pickWithinBudget', () => {
  it('keeps whole countries, smallest first, and names the ones left out', () => {
    const packs = [
      { cc: 'ID', bytes: 900 },
      { cc: 'GB', bytes: 60 },
      { cc: 'US', bytes: 80 },
      { cc: 'TR', bytes: 500 },
    ];
    const { keep, left, total } = build.pickWithinBudget(packs, 700);
    expect(keep.map((p: { cc: string }) => p.cc)).toEqual(['GB', 'US', 'TR']);
    expect(left.map((p: { cc: string }) => p.cc)).toEqual(['ID']);
    expect(total).toBe(640);
  });
});
