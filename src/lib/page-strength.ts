// The mushaf strength map (roadmap #10): how well each of the 604 pages is held,
// from the ayah review cards. Pure.

import type { ReviewCard } from '@/types/quran';
import { qualityToHealth } from './review-helpers';

export interface PageStrength {
  page: number;
  /** Ayahs on the page with a review card, of all ayahs on it */
  learned: number;
  total: number;
  strong: number;
  shaky: number;
  weak: number;
  unchecked: number;
  /** 0–1 over the learned ayahs (null when none are) — overdue cards count for less */
  score: number | null;
}

const WEIGHT = { strong: 1, shaky: 0.6, unchecked: 0.5, weak: 0.15 } as const;
const OVERDUE_FACTOR = 0.7;

/** Page index (0-based) of every ayah, from the page starts */
function pageIndexer(pageStarts: [number, number][]) {
  return (surah: number, ayah: number) => {
    let lo = 0;
    let hi = pageStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      const [s, a] = pageStarts[mid];
      if (s < surah || (s === surah && a <= ayah)) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

export function pageStrengths(cards: ReviewCard[], pageStarts: [number, number][], counts: number[], now = Date.now()): PageStrength[] {
  const pageOf = pageIndexer(pageStarts);
  const out: PageStrength[] = pageStarts.map((_, i) => ({ page: i + 1, learned: 0, total: 0, strong: 0, shaky: 0, weak: 0, unchecked: 0, score: null }));
  counts.forEach((n, s) => { for (let a = 1; a <= n; a++) out[pageOf(s + 1, a)].total++; });
  const sums = new Array(out.length).fill(0);
  for (const c of cards) {
    const p = out[pageOf(c.surahId, c.ayahNumber)];
    if (!p) continue;
    p.learned++;
    const health = c.lastReview === 0 ? 'unchecked' : qualityToHealth(c.lastQuality);
    if (health === 'strong') p.strong++;
    else if (health === 'shaky') p.shaky++;
    else if (health === 'weak') p.weak++;
    else p.unchecked++;
    const w = WEIGHT[health as keyof typeof WEIGHT] ?? 0.5;
    sums[p.page - 1] += c.nextReview < now - 86_400_000 ? w * OVERDUE_FACTOR : w;
  }
  for (const p of out) if (p.learned) p.score = sums[p.page - 1] / p.learned;
  return out;
}

export type PageTone = 'none' | 'weak' | 'shaky' | 'ok' | 'strong';
export function toneOf(p: PageStrength): PageTone {
  if (p.score === null) return 'none';
  if (p.weak > 0 && p.score < 0.5) return 'weak';
  if (p.score < 0.6) return 'shaky';
  if (p.score < 0.85) return 'ok';
  return 'strong';
}
