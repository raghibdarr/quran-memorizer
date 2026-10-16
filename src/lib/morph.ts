/**
 * Lines up an ayah and its near-twin for the similar-verse morph (roadmap V1): the words
 * they share, in order, and between them the groups where they differ. The differing word
 * indexes come from scripts/build-mutashabihat.mjs (`d` in this ayah, `t` in the twin).
 */
export type MorphPart =
  | { kind: 'same'; a: number; b: number }
  | { kind: 'diff'; a: number[]; b: number[] };

/** null when the shared words don't pair up one for one (then there's nothing to morph) */
export function morphParts(aCount: number, aDiff: number[], bCount: number, bDiff: number[]): MorphPart[] | null {
  const da = new Set(aDiff), db = new Set(bDiff);
  if (aCount - da.size !== bCount - db.size) return null;
  const parts: MorphPart[] = [];
  let i = 0, j = 0;
  while (i < aCount || j < bCount) {
    if (i < aCount && j < bCount && !da.has(i) && !db.has(j)) {
      parts.push({ kind: 'same', a: i++, b: j++ });
      continue;
    }
    const group: { kind: 'diff'; a: number[]; b: number[] } = { kind: 'diff', a: [], b: [] };
    while (i < aCount && da.has(i)) group.a.push(i++);
    while (j < bCount && db.has(j)) group.b.push(j++);
    if (!group.a.length && !group.b.length) return null; // one side ran out of words
    parts.push(group);
  }
  return parts;
}
