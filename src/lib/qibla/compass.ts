// The phone's heading, for the qibla compass. Browser and WebView sensors only
// (no plugin): DeviceOrientation events.
//
//   iOS      `webkitCompassHeading` on deviceorientation, after
//            DeviceOrientationEvent.requestPermission(), which Safari only
//            allows from a tap. It is measured from MAGNETIC north: WebKit
//            passes CLHeading.magneticHeading (WebCoreMotionManager.mm), and
//            Apple documents it as "relative to magnetic north".
//   Android  deviceorientationabsolute: alpha/beta/gamma relative to MAGNETIC
//            north.
// Either way the caller adds the declination (declination.ts) to get true north.
//
// Raw readings jitter, so they go through a circular low-pass filter (an
// average of unit vectors: 359° and 1° average to 0°, not 180°), and the
// spread of what the filter rejects tells us when the compass needs a
// figure-8 calibration.

const DEG = Math.PI / 180;

export const norm360 = (d: number) => ((d % 360) + 360) % 360;

/** b - a folded into (-180, 180]: positive means turn clockwise (right) */
export function angleDiff(a: number, b: number): number {
  const d = norm360(b - a);
  return d > 180 ? d - 360 : d;
}

/**
 * Heading of the phone from alpha/beta/gamma (W3C DeviceOrientation frame),
 * tilt-compensated. Held flat-ish it is where the top edge points (rolling the
 * phone sideways doesn't move it); held upright it is where the camera looks.
 * Between about 50 and 70 degrees of tilt the two are blended so the reading
 * doesn't jump. Degrees clockwise from the frame's north.
 */
export function headingFromOrientation(alpha: number, beta: number, gamma: number): number {
  const cX = Math.cos(beta * DEG);
  const sX = Math.sin(beta * DEG);
  const cY = Math.cos(gamma * DEG);
  const sY = Math.sin(gamma * DEG);
  const cZ = Math.cos(alpha * DEG);
  const sZ = Math.sin(alpha * DEG);
  // Horizontal (east, north) parts of the top edge (device +y) and the camera direction (device -z)
  const top = { e: -sZ, n: cZ }; // the top edge's horizontal part is this times cos(beta)
  const camE = -(cY * sZ * sX + cZ * sY);
  const camN = cZ * cY * sX - sZ * sY;
  const camLen = Math.hypot(camE, camN);
  // Weight of the top edge: 1 when cos(beta) >= 0.65 (under ~50 degrees), 0 below 0.35 (over ~70)
  const u = Math.min(1, Math.max(0, (cX - 0.35) / 0.3));
  const w = camLen < 1e-9 ? 1 : u * u * (3 - 2 * u);
  const east = w * top.e + (1 - w) * (camLen < 1e-9 ? 0 : camE / camLen);
  const north = w * top.n + (1 - w) * (camLen < 1e-9 ? 0 : camN / camLen);
  if (Math.hypot(east, north) < 1e-9) return norm360(-alpha);
  return norm360(Math.atan2(east, north) / DEG);
}

/** How far the screen is rotated from the device's natural portrait (0, 90, 180, 270) */
export function screenAngle(win: Window | undefined = typeof window === 'undefined' ? undefined : window): number {
  if (!win) return 0;
  const a = win.screen?.orientation?.angle ?? (win as unknown as { orientation?: number }).orientation ?? 0;
  return typeof a === 'number' && Number.isFinite(a) ? a : 0;
}

/** Unit vector (cos, sin) of an angle in degrees */
interface Vec {
  x: number;
  y: number;
}
const toVec = (deg: number): Vec => ({ x: Math.cos(deg * DEG), y: Math.sin(deg * DEG) });
const toDeg = (v: Vec) => norm360(Math.atan2(v.y, v.x) / DEG);

/** Mean direction of angles (degrees); NaN when they cancel out */
export function circularMean(degs: readonly number[]): number {
  let x = 0;
  let y = 0;
  for (const d of degs) {
    x += Math.cos(d * DEG);
    y += Math.sin(d * DEG);
  }
  if (Math.hypot(x, y) < 1e-9) return NaN;
  return toDeg({ x, y });
}

/** Circular standard deviation of angles, degrees: about the ordinary spread for small spreads */
export function circularSpread(degs: readonly number[]): number {
  if (degs.length === 0) return 0;
  let x = 0;
  let y = 0;
  for (const d of degs) {
    x += Math.cos(d * DEG);
    y += Math.sin(d * DEG);
  }
  const R = Math.min(1, Math.hypot(x, y) / degs.length);
  if (R <= 1e-9) return 180;
  return Math.sqrt(-2 * Math.log(R)) / DEG;
}

export interface FilterOptions {
  /** Low-pass time constant, ms: higher is steadier but lags more */
  tauMs?: number;
  /** How much recent history the jitter measure looks at, ms */
  windowMs?: number;
  /** Jitter (degrees) that turns the calibration hint on, and the lower level that turns it off */
  calibrateAbove?: number;
  calibratedBelow?: number;
}

export interface FilterReading {
  heading: number;
  /** Circular spread of the raw readings around the smoothed heading, degrees */
  jitter: number;
  needsCalibration: boolean;
}

/**
 * Circular low-pass filter for compass headings, with a jitter measure. The
 * jitter is the spread of (raw minus smoothed) over a short window, around its
 * own mean, so steadily turning the phone (which only adds a constant lag)
 * doesn't count as noise. The calibration flag has hysteresis so it doesn't flicker.
 */
export class HeadingFilter {
  private v: Vec | null = null;
  private lastT = 0;
  private residuals: { t: number; d: number }[] = [];
  private calibrate = false;
  private readonly tau: number;
  private readonly windowMs: number;
  private readonly above: number;
  private readonly below: number;

  constructor(opts: FilterOptions = {}) {
    this.tau = opts.tauMs ?? 140;
    this.windowMs = opts.windowMs ?? 1500;
    this.above = opts.calibrateAbove ?? 12;
    this.below = opts.calibratedBelow ?? 6;
  }

  reset() {
    this.v = null;
    this.residuals = [];
    this.calibrate = false;
  }

  push(raw: number, t: number): FilterReading {
    const r = toVec(raw);
    if (!this.v) {
      this.v = r;
    } else {
      const dt = Math.max(0, Math.min(1000, t - this.lastT));
      const k = 1 - Math.exp(-dt / this.tau);
      const x = this.v.x + k * (r.x - this.v.x);
      const y = this.v.y + k * (r.y - this.v.y);
      const len = Math.hypot(x, y);
      // Exactly opposite readings can cancel: keep the old direction then
      this.v = len < 1e-9 ? this.v : { x: x / len, y: y / len };
    }
    this.lastT = t;
    const heading = toDeg(this.v);

    this.residuals.push({ t, d: angleDiff(heading, raw) });
    while (this.residuals.length && this.residuals[0].t < t - this.windowMs) this.residuals.shift();
    const ds = this.residuals.map((s) => s.d);
    const jitter = ds.length >= 8 ? circularSpread(ds) : 0;
    if (!this.calibrate && jitter > this.above) this.calibrate = true;
    else if (this.calibrate && jitter < this.below) this.calibrate = false;
    return { heading, jitter, needsCalibration: this.calibrate };
  }
}

/**
 * Aligned with the qibla, with hysteresis: in within `enter` degrees, out only
 * beyond `exit`, so the "aligned" state (and its one haptic) doesn't chatter.
 */
export class AlignGate {
  aligned = false;
  constructor(private readonly enter = 3, private readonly exit = 6) {}
  /** Returns true only on the reading that crosses into alignment */
  update(delta: number): boolean {
    const off = Math.abs(delta);
    if (!this.aligned && off <= this.enter) {
      this.aligned = true;
      return true;
    }
    if (this.aligned && off > this.exit) this.aligned = false;
    return false;
  }
}

// ---------- Sensors ----------

export type CompassSupport = 'ios' | 'absolute' | 'none';

interface OrientationEventCtor {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

/** What this browser offers. 'none' also covers desktop browsers with no sensor at all */
export function detectCompassSupport(win: Window | undefined = typeof window === 'undefined' ? undefined : window): CompassSupport {
  if (!win) return 'none';
  const Ctor = (win as unknown as { DeviceOrientationEvent?: OrientationEventCtor }).DeviceOrientationEvent;
  if (!Ctor) return 'none';
  if (typeof Ctor.requestPermission === 'function') return 'ios';
  if ('ondeviceorientationabsolute' in win) return 'absolute';
  // Firefox: plain deviceorientation can be absolute; we find out from the first event
  if ('ondeviceorientation' in win) return 'absolute';
  return 'none';
}

/** iOS needs a permission prompt, and only from a tap */
export function compassNeedsPermission(win?: Window): boolean {
  return detectCompassSupport(win) === 'ios';
}

/** Ask for motion access (iOS). Call from a tap handler. Elsewhere resolves 'granted' */
export async function requestCompassPermission(
  win: Window | undefined = typeof window === 'undefined' ? undefined : window,
): Promise<'granted' | 'denied'> {
  const Ctor = (win as unknown as { DeviceOrientationEvent?: OrientationEventCtor } | undefined)?.DeviceOrientationEvent;
  if (!Ctor || typeof Ctor.requestPermission !== 'function') return 'granted';
  try {
    return (await Ctor.requestPermission()) === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'denied';
  }
}

export interface RawHeading {
  /** Degrees clockwise from north, already turned for the screen's rotation */
  heading: number;
  /** Which north the sensor measures from */
  reference: 'true' | 'magnetic';
  /** iOS only: the OS's own accuracy estimate in degrees */
  accuracy?: number;
  t: number;
}

interface IOSOrientationEvent extends DeviceOrientationEvent {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

/**
 * Turns one orientation event into a heading, or null when it carries none
 * (a desktop browser fires events with null angles).
 */
export function readOrientationEvent(e: IOSOrientationEvent, screenDeg: number, t: number): RawHeading | null {
  if (typeof e.webkitCompassHeading === 'number' && Number.isFinite(e.webkitCompassHeading)) {
    const accuracy = typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : undefined;
    // A negative heading or accuracy is iOS saying it has no heading (WebKit sends
    // heading 0 with accuracy -1 then): that is not "facing north"
    if (e.webkitCompassHeading < 0 || (accuracy !== undefined && accuracy < 0)) return null;
    return { heading: norm360(e.webkitCompassHeading + screenDeg), reference: 'magnetic', accuracy, t };
  }
  if (e.alpha == null || !Number.isFinite(e.alpha)) return null;
  if (e.type === 'deviceorientation' && !e.absolute) return null; // relative to wherever the page loaded: useless
  const heading = headingFromOrientation(e.alpha, e.beta ?? 0, e.gamma ?? 0);
  return { heading: norm360(heading + screenDeg), reference: 'magnetic', t };
}

export interface CompassHandlers {
  onReading: (r: RawHeading) => void;
  /** No usable reading arrived in time: no sensor, or the browser hides it */
  onNoData: () => void;
}

/**
 * Listens to the sensor. Returns a stop function. Ask permission first on iOS
 * (requestCompassPermission, from a tap).
 */
export function startCompass(handlers: CompassHandlers, opts: { timeoutMs?: number } = {}): () => void {
  if (typeof window === 'undefined') return () => {};
  let got = false;
  const listener = (ev: Event) => {
    const r = readOrientationEvent(ev as IOSOrientationEvent, screenAngle(), performance.now());
    if (!r) return;
    got = true;
    handlers.onReading(r);
  };
  const absolute = 'ondeviceorientationabsolute' in window && detectCompassSupport() !== 'ios';
  const type = absolute ? 'deviceorientationabsolute' : 'deviceorientation';
  window.addEventListener(type, listener);
  const timer = window.setTimeout(() => {
    if (!got) handlers.onNoData();
  }, opts.timeoutMs ?? 2500);
  return () => {
    window.removeEventListener(type, listener);
    window.clearTimeout(timer);
  };
}

const POINTS = [
  'north', 'north-northeast', 'northeast', 'east-northeast',
  'east', 'east-southeast', 'southeast', 'south-southeast',
  'south', 'south-southwest', 'southwest', 'west-southwest',
  'west', 'west-northwest', 'northwest', 'north-northwest',
] as const;

/** The 16-point compass name of a bearing: 119 → "east-southeast" */
export function compassPoint(bearing: number): (typeof POINTS)[number] {
  return POINTS[Math.round(norm360(bearing) / 22.5) % 16];
}
