/**
 * Deterministic shuffle (seeded LCG) that never returns the original order for
 * 2+ items. For anything shuffled during render, which must stay pure: the
 * same seed always gives the same order.
 */
export function seededShuffle<T>(items: T[], seedText: string): T[] {
  let seed = 0;
  for (const ch of seedText) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.length > 1 && out.every((x, i) => x === items[i])) out.push(out.shift()!);
  return out;
}
