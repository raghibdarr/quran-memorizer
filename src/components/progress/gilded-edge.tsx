'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReviewCard } from '@/types/quran';
import { pageStrengths } from '@/lib/page-strength';
import { getSurahIndex } from '@/lib/quran-data';
import { renderEdgeCard, shareImage } from '@/lib/share-image';
import { cn } from '@/lib/cn';

type Meta = { page: [number, number][]; counts: number[] };
const PAGES = 604;

/** How brightly a page edge is gilded: 0 not learned, else 0–1 by how well it's held */
export function giltOf(score: number | null): number {
  if (score === null) return 0;
  return Math.max(0.15, Math.min(1, score));
}

/**
 * The gilded fore-edge (roadmap V3): your mushaf seen from its edge, every page's edge
 * gilded as far as you hold it, so a third of the Quran held is a third of the edge in
 * gold. The gilding sweeps in from the last page, the way hifz usually begins; it can be
 * shared as an image.
 */
export default function GildedEdge({ cards }: { cards: ReviewCard[] }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [shown, setShown] = useState(false);
  const [sharing, setSharing] = useState<'idle' | 'busy' | 'downloaded'>('idle');

  useEffect(() => {
    if (!cards.length) return;
    Promise.all([import('@/data/quran-meta.json'), getSurahIndex()]).then(([m, idx]) => {
      const raw = m.default as unknown as { page: [number, number][] };
      setMeta({ page: raw.page, counts: [...idx].sort((a, b) => a.id - b.id).map((s) => s.versesCount) });
    });
  }, [cards.length]);
  useEffect(() => {
    if (!meta) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [meta]);

  const pages = useMemo(() => (meta ? pageStrengths(cards, meta.page, meta.counts) : []), [cards, meta]);
  const gilt = useMemo(() => pages.map((p) => giltOf(p.score)), [pages]);
  const held = gilt.filter(Boolean).length;
  const strong = pages.filter((p) => p.score !== null && p.score >= 0.85).length;
  const since = useMemo(() => {
    const first = Math.min(...cards.map((c) => c.lastReview).filter((t) => t > 0));
    return Number.isFinite(first) ? new Date(first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : null;
  }, [cards]);

  if (!cards.length || !meta) return null;

  const share = async () => {
    setSharing('busy');
    try {
      const blob = await renderEdgeCard({ gilt, held, strong, since, dark: document.documentElement.classList.contains('dark') });
      const how = await shareImage(blob, 'takrar-mushaf.png', 'My mushaf');
      setSharing(how === 'downloaded' ? 'downloaded' : 'idle');
    } catch {
      setSharing('idle');
    }
  };

  return (
    <section className="rounded-2xl bg-card p-4" data-gilded-edge>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-bold text-foreground">Your mushaf, edge-on</h2>
        <p className="text-sm font-semibold text-gold-deep">{held} of {PAGES} pages</p>
      </div>
      <p className="mt-0.5 text-xs text-muted">Each page edge is gilded as far as you hold it.</p>
      <svg viewBox={`0 0 ${PAGES + 16} 110`} className="mt-3 w-full" role="img" aria-label={`${held} of ${PAGES} pages held, ${strong} of them strongly`}>
        <rect x="0" y="0" width={PAGES + 16} height="110" rx="6" className="fill-foreground/[0.06]" />
        {gilt.map((g, i) => g > 0 && (
          // Page 1 at the right, as an Arabic mushaf opens; the sweep starts at page 604
          <rect
            key={i}
            x={8 + (PAGES - 1 - i)}
            y="8"
            width="0.9"
            height="94"
            fill="#C8963E"
            className={cn('motion-safe:transition-opacity motion-safe:duration-300', !shown && 'motion-safe:opacity-0')}
            style={{ opacity: shown ? 0.35 + 0.65 * g : undefined, transitionDelay: `${(PAGES - 1 - i) * 3}ms` }}
          />
        ))}
      </svg>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">{strong ? `${strong} held strongly` : 'Keep reviewing to brighten them'}{since ? ` · since ${since}` : ''}</p>
        <button type="button" onClick={() => void share()} className="min-h-9 shrink-0 rounded-full bg-gold/15 px-3 text-xs font-semibold text-gold-deep" data-share-edge>
          {sharing === 'busy' ? 'Making…' : sharing === 'downloaded' ? 'Saved' : 'Share'}
        </button>
      </div>
    </section>
  );
}
