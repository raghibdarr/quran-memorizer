/**
 * Recitation pace (roadmap V5): your pace in the voice check against your reciter's, from
 * the reciter's word timings. The voice engine hears words a little late and unevenly, so
 * this is a rough guide, worded gently: rushing is the fault it's meant to catch.
 */

/** [word (1-based), startMs, endMs] rows for one ayah, as in public/segments */
export type Rows = [number, number, number][];

/** How long the reciter takes over an ayah: first word's start to last word's end */
export function ayahDurationMs(rows: Rows | undefined): number | null {
  if (!rows?.length) return null;
  const start = rows[0][1], end = rows[rows.length - 1][2];
  return end > start ? end - start : null;
}

/** Your speed as a multiple of the reciter's: 1.3 = 30% quicker. null when there's too little to go on */
export function paceRatio(yourMs: number, reciterMs: number): number | null {
  if (yourMs < 3000 || reciterMs < 3000) return null;
  return Math.round((reciterMs / yourMs) * 10) / 10;
}

export function paceSentence(ratio: number | null, reciterName: string): string | null {
  if (ratio === null) return null;
  if (ratio >= 1.3) return `You recited about ${ratio}× as fast as ${reciterName}. Slowing down gives each letter and madd its due.`;
  if (ratio <= 0.7) return `You recited more slowly than ${reciterName}, which is fine while it's new.`;
  return `Your pace was close to ${reciterName}'s.`;
}

/** Where the reciter would be by now, 0–1 through the passage, starting when you did */
export function reciterProgress(elapsedMs: number, totalMs: number): number {
  return totalMs > 0 ? Math.max(0, Math.min(1, elapsedMs / totalMs)) : 0;
}
