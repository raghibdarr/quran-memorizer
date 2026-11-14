import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bearingDeg, compassName, compassPoint, formatDistance, haversineKm, usesMiles } from './geo';

const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };
const MAKKAH = { lat: 21.4225, lng: 39.8262 };
const NYC = { lat: 40.7128, lng: -74.006 };

describe('haversineKm', () => {
  it('matches reference distances', () => {
    // Reference values from the haversine formula with R = 6371.0088 km
    expect(haversineKm(LONDON, PARIS)).toBeCloseTo(343.56, 0);
    expect(haversineKm(LONDON, NYC)).toBeCloseTo(5570.2, -1);
    expect(haversineKm(LONDON, MAKKAH)).toBeGreaterThan(4780);
    expect(haversineKm(LONDON, MAKKAH)).toBeLessThan(4800);
  });

  it('is zero for the same point and symmetric', () => {
    expect(haversineKm(LONDON, LONDON)).toBe(0);
    expect(haversineKm(LONDON, PARIS)).toBeCloseTo(haversineKm(PARIS, LONDON), 9);
  });

  it('one degree of latitude is about 111.2 km', () => {
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.2, 1);
  });

  it('handles the antimeridian and antipodes', () => {
    expect(haversineKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 })).toBeCloseTo(22.24, 1);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * 6371.0088, 3);
  });

  it('never NaN, never negative, never more than half the circumference', () => {
    const pt = fc.record({ lat: fc.double({ min: -90, max: 90, noNaN: true }), lng: fc.double({ min: -180, max: 180, noNaN: true }) });
    fc.assert(
      fc.property(pt, pt, (a, b) => {
        const d = haversineKm(a, b);
        return Number.isFinite(d) && d >= 0 && d <= Math.PI * 6371.0088 + 1e-6;
      }),
    );
  });
});

describe('bearingDeg', () => {
  it('cardinal directions', () => {
    const o = { lat: 0, lng: 0 };
    expect(bearingDeg(o, { lat: 1, lng: 0 })).toBeCloseTo(0, 6);
    expect(bearingDeg(o, { lat: 0, lng: 1 })).toBeCloseTo(90, 6);
    expect(bearingDeg(o, { lat: -1, lng: 0 })).toBeCloseTo(180, 6);
    expect(bearingDeg(o, { lat: 0, lng: -1 })).toBeCloseTo(270, 6);
  });

  it('matches reference initial bearings', () => {
    expect(bearingDeg(LONDON, PARIS)).toBeCloseTo(148.1, 0);
    // London to Makkah: the qibla from London, about 119°
    expect(bearingDeg(LONDON, MAKKAH)).toBeCloseTo(118.99, 0);
    expect(bearingDeg(NYC, MAKKAH)).toBeCloseTo(58.48, 0);
  });

  it('is 0 for the same point and always in [0, 360)', () => {
    expect(bearingDeg(PARIS, PARIS)).toBe(0);
    const pt = fc.record({ lat: fc.double({ min: -89.9, max: 89.9, noNaN: true }), lng: fc.double({ min: -180, max: 180, noNaN: true }) });
    fc.assert(
      fc.property(pt, pt, (a, b) => {
        const t = bearingDeg(a, b);
        return Number.isFinite(t) && t >= 0 && t < 360;
      }),
    );
  });
});

describe('compassPoint', () => {
  it('rounds to the nearest of eight points', () => {
    expect(compassPoint(0)).toBe('N');
    expect(compassPoint(22.4)).toBe('N');
    expect(compassPoint(22.6)).toBe('NE');
    expect(compassPoint(90)).toBe('E');
    expect(compassPoint(180)).toBe('S');
    expect(compassPoint(225)).toBe('SW');
    expect(compassPoint(337.6)).toBe('N');
    expect(compassPoint(359.9)).toBe('N');
    expect(compassPoint(-90)).toBe('W');
    expect(compassPoint(720 + 45)).toBe('NE');
    expect(compassName('SE')).toBe('south-east');
  });
});

describe('formatDistance', () => {
  it('metric', () => {
    expect(formatDistance(0)).toBe('10 m');
    expect(formatDistance(0.344)).toBe('340 m');
    expect(formatDistance(0.996)).toBe('1.0 km');
    expect(formatDistance(1.24)).toBe('1.2 km');
    expect(formatDistance(9.96)).toBe('10 km');
    expect(formatDistance(14.4, 'DE')).toBe('14 km');
  });

  it('miles where road signs use them', () => {
    expect(usesMiles('gb')).toBe(true);
    expect(usesMiles('FR')).toBe(false);
    expect(formatDistance(0, 'GB')).toBe('0.1 mi');
    expect(formatDistance(1.609344, 'US')).toBe('1.0 mi');
    expect(formatDistance(20, 'GB')).toBe('12 mi');
  });
});
