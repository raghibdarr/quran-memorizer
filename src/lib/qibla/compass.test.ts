import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  AlignGate,
  HeadingFilter,
  angleDiff,
  circularMean,
  circularSpread,
  compassPoint,
  detectCompassSupport,
  headingFromOrientation,
  readOrientationEvent,
  requestCompassPermission,
} from './compass'

const gap = (a: number, b: number) => Math.abs(angleDiff(a, b))

describe('angles', () => {
  it('angleDiff folds into (-180, 180] and is positive clockwise', () => {
    expect(angleDiff(359, 1)).toBe(2)
    expect(angleDiff(1, 359)).toBe(-2)
    expect(angleDiff(10, 190)).toBe(180)
    expect(angleDiff(0, 0)).toBe(0)
  })

  it('circularMean wraps at 359/0', () => {
    expect(gap(circularMean([359, 1]), 0)).toBeLessThan(1e-9)
    expect(gap(circularMean([350, 10, 0]), 0)).toBeLessThan(1e-9)
    expect(circularMean([358, 2, 359, 1])).toBeLessThan(1e-6 + 360)
    expect(Number.isNaN(circularMean([0, 180]))).toBe(true)
  })

  it('circularSpread is about the ordinary spread for small angles, across the wrap too', () => {
    expect(circularSpread([10, 10, 10])).toBeCloseTo(0, 4)
    const a = circularSpread([-5, 5, -5, 5])
    const b = circularSpread([355, 5, 355, 5])
    expect(a).toBeCloseTo(5, 1)
    expect(b).toBeCloseTo(a, 9)
  })

  it('compassPoint', () => {
    expect(compassPoint(0)).toBe('north')
    expect(compassPoint(359)).toBe('north')
    expect(compassPoint(119)).toBe('east-southeast')
    expect(compassPoint(58.5)).toBe('east-northeast')
    expect(compassPoint(295)).toBe('west-northwest')
  })
})

describe('headingFromOrientation', () => {
  it('flat on the palm: the heading is 360 minus alpha', () => {
    expect(headingFromOrientation(0, 0, 0)).toBeCloseTo(0, 9)
    expect(headingFromOrientation(90, 0, 0)).toBeCloseTo(270, 9)
    expect(headingFromOrientation(270, 0, 0)).toBeCloseTo(90, 9)
    expect(headingFromOrientation(30, 0, 0)).toBeCloseTo(330, 9)
  })

  it('tilting the top edge up (beta) does not change the heading', () => {
    for (const beta of [10, 45, 80, 90]) expect(gap(headingFromOrientation(30, beta, 0), 330)).toBeLessThan(1e-6)
  })

  it('rolling a flat-ish phone sideways does not move it', () => {
    expect(gap(headingFromOrientation(30, 20, 10), 330)).toBeLessThan(1e-6)
    expect(gap(headingFromOrientation(30, -10, -25), 330)).toBeLessThan(1e-6)
  })

  it('held upright it follows the camera, and is continuous through the blend', () => {
    expect(gap(headingFromOrientation(30, 90, 0), 330)).toBeLessThan(1e-6)
    let prev = headingFromOrientation(30, 0, 8)
    for (let beta = 1; beta <= 100; beta++) {
      const h = headingFromOrientation(30, beta, 8)
      expect(gap(h, prev)).toBeLessThan(2)
      prev = h
    }
  })
})

describe('HeadingFilter', () => {
  it('smooths across the 359/0 wrap without swinging through 180', () => {
    const f = new HeadingFilter()
    let t = 0
    const out: number[] = []
    for (let i = 0; i < 60; i++) {
      out.push(f.push(i % 2 ? 359 : 1, (t += 16)).heading)
    }
    for (const h of out.slice(5)) expect(gap(h, 0)).toBeLessThan(1.5)
  })

  it('follows a turn from 350 through 0 to 20', () => {
    const f = new HeadingFilter()
    let t = 0
    let r = f.push(350, t)
    for (let h = 350; h <= 380; h += 1) r = f.push(h % 360, (t += 16))
    for (let i = 0; i < 40; i++) r = f.push(20, (t += 16))
    expect(gap(r.heading, 20)).toBeLessThan(0.5)
  })

  it('steady readings need no calibration; a jittery compass does, with hysteresis', () => {
    const f = new HeadingFilter()
    let t = 0
    let r = f.push(100, t)
    for (let i = 0; i < 100; i++) r = f.push(100 + (i % 2 ? 1 : -1), (t += 16))
    expect(r.needsCalibration).toBe(false)
    // Wild swings of +-40 degrees
    for (let i = 0; i < 100; i++) r = f.push(100 + (i % 2 ? 40 : -40), (t += 16))
    expect(r.needsCalibration).toBe(true)
    expect(r.jitter).toBeGreaterThan(12)
    // Settling to a middling jitter keeps the hint (hysteresis) ...
    for (let i = 0; i < 100; i++) r = f.push(100 + (i % 2 ? 9 : -9), (t += 16))
    expect(r.needsCalibration).toBe(true)
    // ... and steady readings clear it
    for (let i = 0; i < 100; i++) r = f.push(100, (t += 16))
    expect(r.needsCalibration).toBe(false)
  })

  it('turning the phone steadily is not mistaken for jitter', () => {
    const f = new HeadingFilter()
    let t = 0
    let r = f.push(0, t)
    for (let i = 1; i < 200; i++) r = f.push((i * 1.5) % 360, (t += 16)) // 90 degrees a second
    expect(r.needsCalibration).toBe(false)
  })

  it('always returns a heading in [0, 360)', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: -720, max: 720, noNaN: true }), { minLength: 1, maxLength: 50 }), (raws) => {
        const f = new HeadingFilter()
        let t = 0
        return raws.every((raw) => {
          const h = f.push(raw, (t += 16)).heading
          return h >= 0 && h < 360
        })
      }),
    )
  })
})

describe('AlignGate', () => {
  it('fires once on entering, not again until it has left beyond the exit margin', () => {
    const g = new AlignGate(3, 6)
    expect(g.update(10)).toBe(false)
    expect(g.update(2.5)).toBe(true)
    expect(g.update(-2)).toBe(false)
    expect(g.update(5)).toBe(false) // still aligned (inside the exit margin)
    expect(g.aligned).toBe(true)
    expect(g.update(7)).toBe(false)
    expect(g.aligned).toBe(false)
    expect(g.update(-1)).toBe(true)
  })
})

describe('sensor plumbing', () => {
  it('detects iOS, absolute and no support', () => {
    const ios = { DeviceOrientationEvent: { requestPermission: async () => 'granted' } } as unknown as Window
    expect(detectCompassSupport(ios)).toBe('ios')
    const android = { DeviceOrientationEvent: function () {}, ondeviceorientationabsolute: null } as unknown as Window
    expect(detectCompassSupport(android)).toBe('absolute')
    expect(detectCompassSupport({} as Window)).toBe('none')
    expect(detectCompassSupport(undefined)).toBe('none')
  })

  it('requestCompassPermission maps the answer, and never throws', async () => {
    const mk = (fn: () => Promise<string>) => ({ DeviceOrientationEvent: { requestPermission: fn } }) as unknown as Window
    expect(await requestCompassPermission(mk(async () => 'granted'))).toBe('granted')
    expect(await requestCompassPermission(mk(async () => 'denied'))).toBe('denied')
    expect(await requestCompassPermission(mk(async () => { throw new Error('not from a tap') }))).toBe('denied')
    expect(await requestCompassPermission({} as Window)).toBe('granted')
  })

  it('reads iOS true headings, Android absolute headings, and ignores empty or relative events', () => {
    const ev = (o: Record<string, unknown>) => o as unknown as DeviceOrientationEvent
    expect(readOrientationEvent(ev({ type: 'deviceorientation', webkitCompassHeading: 350, webkitCompassAccuracy: 10, alpha: 5 }), 0, 1))
      .toEqual({ heading: 350, reference: 'true', accuracy: 10, t: 1 })
    expect(readOrientationEvent(ev({ type: 'deviceorientation', webkitCompassHeading: 350 }), 90, 1)!.heading).toBe(80)
    const abs = readOrientationEvent(ev({ type: 'deviceorientationabsolute', alpha: 90, beta: 0, gamma: 0, absolute: true }), 0, 2)!
    expect(abs.reference).toBe('magnetic')
    expect(abs.heading).toBeCloseTo(270, 9)
    expect(readOrientationEvent(ev({ type: 'deviceorientationabsolute', alpha: null, beta: null, gamma: null }), 0, 3)).toBeNull()
    expect(readOrientationEvent(ev({ type: 'deviceorientation', alpha: 10, beta: 0, gamma: 0, absolute: false }), 0, 3)).toBeNull()
  })
})

describe('screen rotation', () => {
  const ev = (o: Record<string, unknown>) => o as unknown as Parameters<typeof readOrientationEvent>[0];
  it('in landscape the heading is where the user faces, not where the top edge points', () => {
    // Top edge north, screen turned 90: the user looks east
    expect(readOrientationEvent(ev({ type: 'deviceorientationabsolute', alpha: 0, beta: 0, gamma: 0, absolute: true }), 90, 0)?.heading).toBeCloseTo(90, 6);
    expect(readOrientationEvent(ev({ type: 'deviceorientation', webkitCompassHeading: 300 }), 90, 0)?.heading).toBeCloseTo(30, 6);
    expect(readOrientationEvent(ev({ type: 'deviceorientation', webkitCompassHeading: 10 }), 270, 0)?.heading).toBeCloseTo(280, 6);
  });
  it('an uncalibrated iOS reading (negative heading) carries no heading', () => {
    expect(readOrientationEvent(ev({ type: 'deviceorientation', webkitCompassHeading: -1, alpha: 40, absolute: false }), 0, 0)).toBeNull();
  });
});
