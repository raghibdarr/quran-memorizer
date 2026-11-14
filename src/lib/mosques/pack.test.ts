import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { OSM_ATTRIBUTION, PackError, loadPack, nearestMosques, packPath, toMosque, validatePack, type MosquePack } from './pack';
import { mapsHref, pinLabel } from './links';
import { MOSQUE_INDEX, packInfo } from './index-data';

const DIR = join(process.cwd(), 'public', 'data', 'mosques');
const SOURCE_MD = join(process.cwd(), 'data-sources', 'osm-mosques', 'SOURCE.md');

const pack = (m: MosquePack['m'], cc = 'GB'): MosquePack => ({ v: 1, cc, date: '2026-11-13', attribution: OSM_ATTRIBUTION, m });

describe('every committed pack', () => {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^[A-Z]{2}\.json$/.test(f)) : [];
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as { v: number; date: string; countries: Record<string, { count: number; bytes: number }> };
  const md = readFileSync(SOURCE_MD, 'utf8');

  it('there are packs, and they include the UK and the US', () => {
    expect(files).toContain('GB.json');
    expect(files).toContain('US.json');
  });

  it('stay under the 8 MB budget together', () => {
    const total = files.reduce((s, f) => s + readFileSync(join(DIR, f)).length, 0);
    expect(total).toBeLessThan(8_000_000);
  });

  it('the bundled index is the committed index', () => {
    expect(MOSQUE_INDEX).toEqual(index);
    expect(Object.keys(index.countries).sort()).toEqual(files.map((f) => f.slice(0, 2)).sort());
  });

  it.each(files)('%s: format, index row, sha256 in SOURCE.md', (f) => {
    const buf = readFileSync(join(DIR, f));
    const cc = f.slice(0, 2);
    const json = JSON.parse(buf.toString('utf8')) as MosquePack;
    expect(validatePack(json, cc)).toEqual([]);
    expect(json.m.length).toBeGreaterThan(0);
    expect(json.date).toBe(index.date);
    expect(index.countries[cc]).toEqual({ count: json.m.length, bytes: buf.length });
    expect(md).toContain(createHash('sha256').update(buf).digest('hex'));
    // Compact: 4 decimals at most, no empty trailing names, nothing but positions and names
    for (const e of json.m) {
      expect(Math.round(e[0] * 1e4) / 1e4).toBe(e[0]);
      expect(Math.round(e[1] * 1e4) / 1e4).toBe(e[1]);
      if (e.length > 2) expect(e[e.length - 1]).not.toBe('');
    }
  });
});

describe('validatePack', () => {
  it('accepts a good pack and names the problems in a bad one', () => {
    expect(validatePack(pack([[51.5, -0.1, 'A'], [51.6, -0.2]]), 'GB')).toEqual([]);
    expect(validatePack(null)).toEqual(['not an object']);
    expect(validatePack(pack([]), 'US')).toContain('country GB, expected US');
    expect(validatePack({ ...pack([]), attribution: '' })).toContain('missing OSM attribution');
    expect(validatePack(pack([[91, 0]]))).toContain('entry 0 malformed');
    expect(validatePack(pack([[1, 2, 3 as unknown as string]]))).toContain('entry 0 malformed');
  });
});

describe('nearestMosques', () => {
  const p = pack([
    [51.52, -0.07, 'East London'],
    [51.5, -0.13, 'Central'],
    [53.48, -2.24, 'Manchester'],
    [51.5, -0.13],
    [52.48, -1.9, 'Birmingham', 'مسجد'],
  ]);
  const from = { lat: 51.5, lng: -0.13 };

  it('sorts by distance, nearest first, with distance and bearing', () => {
    const near = nearestMosques(p, from, 10);
    expect(near.map((m) => m.name)).toEqual(['', 'Central', 'East London', 'Birmingham', 'Manchester']);
    expect(near[0].distanceKm).toBe(0);
    expect(near[2].distanceKm).toBeGreaterThan(4);
    expect(near[2].bearing).toBeGreaterThan(45);
    expect(near[2].bearing).toBeLessThan(90);
    expect(near[3].nameAr).toBe('مسجد');
  });

  it('limits', () => {
    expect(nearestMosques(p, from, 2)).toHaveLength(2);
    expect(nearestMosques(p, from, 0)).toHaveLength(0);
    expect(nearestMosques(pack([]), from)).toEqual([]);
  });

  it('defaults to 20', () => {
    const many = pack(Array.from({ length: 50 }, (_, i) => [i / 10, 0, `M${i}`] as [number, number, string]));
    expect(nearestMosques(many, { lat: 0, lng: 0 })).toHaveLength(20);
  });
});

describe('loadPack', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it('GETs only the country file, with no position in it', async () => {
    const f = ok(pack([[51.5, -0.1, 'A']]));
    const got = await loadPack('gb', f as unknown as typeof fetch);
    expect(got.m).toHaveLength(1);
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/data/mosques/GB.json');
    expect(init.body).toBeUndefined();
    expect(init.method ?? 'GET').toBe('GET');
    expect(packPath('us')).toBe('/data/mosques/US.json');
  });

  it('missing, network and invalid errors', async () => {
    await expect(loadPack('GB', ok({}, 404) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'missing' });
    await expect(loadPack('GB', ok({}, 500) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'network' });
    await expect(loadPack('GB', (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'network' });
    await expect(loadPack('GB', ok(pack([]), 200) as unknown as typeof fetch)).resolves.toBeTruthy();
    await expect(loadPack('GB', ok(pack([], 'US')) as unknown as typeof fetch)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(loadPack('../x', ok({}) as unknown as typeof fetch)).rejects.toBeInstanceOf(PackError);
  });
});

describe('index-data', () => {
  it('reports size and count for a covered country, null otherwise', () => {
    const gb = packInfo('gb');
    expect(gb?.count).toBeGreaterThan(0);
    expect(gb?.bytes).toBeGreaterThan(0);
    expect(packInfo('')).toBeNull();
    expect(packInfo('ZZ')).toBeNull();
  });
});

describe('mapsHref', () => {
  const m = toMosque([51.5194, -0.0651, 'East London Mosque (ELM)', 'مسجد شرق لندن']);
  it('geo: URI with the mosque position and a label', () => {
    expect(mapsHref(m)).toBe('geo:51.5194,-0.0651?q=51.5194,-0.0651(East%20London%20Mosque%20ELM)');
  });
  it("Apple Maps' own scheme on iOS", () => {
    expect(mapsHref(m, 'ios')).toBe('maps://?ll=51.5194,-0.0651&q=East%20London%20Mosque%20ELM');
  });
  it('labels an unnamed mosque', () => {
    expect(pinLabel(toMosque([1, 2]))).toBe('Mosque');
    expect(pinLabel({ name: 'Masjid', nameEn: 'Mosque of X' })).toBe('Mosque of X');
  });
});
