/**
 * Where a learner left the memorise flow for an item, so a long text (hadith 2
 * runs to about 30 steps) can be picked up at the part they reached instead of
 * from the start. Kept on this device only: it is a convenience, not progress,
 * and a lost or stale entry just means starting from the beginning.
 */

export interface FlowPosition {
  step: 'build' | 'recall';
  /** The Build unit reached (0 when the position is Recall) */
  unit: number;
  /** How many Build units the item had, so a change to its parts drops the entry */
  units: number;
  at: number;
}

const KEY = 'takrar-memorise-pos';
/** Older entries are dropped: after two weeks, starting again is the better advice */
export const POSITION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 20;

export const positionKey = (deck: string, itemId: string, depth: string) => `${deck}:${itemId}:${depth}`;

function readAll(): Record<string, FlowPosition> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, FlowPosition>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // storage full or blocked: the flow still works, it just won't remember
  }
}

/** A saved place worth offering: recent, for the same parts, and past the first unit */
export function loadPosition(key: string, units: number, now = Date.now()): FlowPosition | null {
  const p = readAll()[key];
  if (!p || typeof p.at !== 'number' || now - p.at > POSITION_TTL_MS) return null;
  if (p.units !== units) return null;
  if (p.step === 'build' && !(Number.isInteger(p.unit) && p.unit > 0 && p.unit < units)) return null;
  if (p.step !== 'build' && p.step !== 'recall') return null;
  return p;
}

export function savePosition(key: string, pos: Omit<FlowPosition, 'at'>, now = Date.now()) {
  const all = readAll();
  all[key] = { ...pos, at: now };
  const keep = Object.entries(all)
    .filter(([, p]) => p && now - p.at <= POSITION_TTL_MS)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, MAX_ENTRIES);
  writeAll(Object.fromEntries(keep));
}

export function clearPosition(key: string) {
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
}
