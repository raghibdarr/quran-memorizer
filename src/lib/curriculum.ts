// Ordered by familiarity and length (per spec)
export const CURRICULUM_ORDER = [1, 112, 113, 114, 108, 103, 110, 111] as const;

export function getNextSurah(completedSurahIds: number[]): number | null {
  const completed = new Set(completedSurahIds);
  return CURRICULUM_ORDER.find(id => !completed.has(id)) ?? null;
}

export function getSurahOrder(surahId: number): number {
  const idx = CURRICULUM_ORDER.indexOf(surahId as (typeof CURRICULUM_ORDER)[number]);
  return idx === -1 ? 999 : idx;
}

export function isMvpSurah(surahId: number): boolean {
  return (CURRICULUM_ORDER as readonly number[]).includes(surahId);
}
