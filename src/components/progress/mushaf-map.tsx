'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReviewCard } from '@/types/quran';
import Card from '@/components/ui/card';
import Link from '@/components/app-link';
import { mushafHref } from '@/lib/routes';
import { pageStrengths, toneOf, type PageTone } from '@/lib/page-strength';
import { getSurahIndex } from '@/lib/quran-data';
import { pageOf } from '@/lib/search';
import { cn } from '@/lib/cn';

const TONE: Record<PageTone, string> = {
  none: 'bg-foreground/[0.06]',
  weak: 'bg-miss/70',
  shaky: 'bg-gold/60',
  ok: 'bg-teal/45',
  strong: 'bg-teal',
};

type Meta = { page: [number, number][]; juz: [number, number][]; counts: number[] };

/**
 * The mushaf strength map (roadmap #10): all 604 pages, a row per juz, coloured by
 * how well the memorised ayahs on each are held. Tap a page to open it.
 */
export default function MushafMap({ cards }: { cards: ReviewCard[] }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    if (!cards.length) return;
    Promise.all([import('@/data/quran-meta.json'), getSurahIndex()]).then(([m, idx]) => {
      const raw = m.default as unknown as { page: [number, number][]; juz: [number, number][] };
      setMeta({ page: raw.page, juz: raw.juz, counts: [...idx].sort((a, b) => a.id - b.id).map((s) => s.versesCount) });
    });
  }, [cards.length]);

  const pages = useMemo(() => (meta ? pageStrengths(cards, meta.page, meta.counts) : []), [cards, meta]);
  const rows = useMemo(() => {
    if (!meta || !pages.length) return [];
    // A juz's row starts at the page its first ayah is on
    const starts = meta.juz.map(([s, a]) => pageOf(meta, s, a));
    return starts.map((first, j) => {
      const last = j + 1 < starts.length ? starts[j + 1] - 1 : pages.length;
      return { juz: j + 1, pages: pages.slice(first - 1, last) };
    });
  }, [meta, pages]);

  if (!cards.length) return null;
  const learned = pages.filter((p) => p.score !== null).length;

  return (
    <Card className="hover:brightness-100 dark:hover:brightness-100" data-mushaf-map>
      <p className="text-sm font-bold text-foreground">Mushaf map</p>
      <p className="mt-0.5 text-xs text-muted">
        Every page of the mushaf, a row per juz, by how well you hold what you&apos;ve memorised on it.
        {learned > 0 && ` ${learned} of 604 pages started.`} Tap a page to open it.
      </p>
      {rows.length === 0 ? (
        <div className="mt-3 h-40 animate-pulse rounded-xl bg-foreground/5" />
      ) : (
        <div className="mt-3 space-y-[3px]" role="list">
          {rows.map((r) => (
            <div key={r.juz} className="flex items-center gap-1.5" role="listitem">
              <span className="w-5 shrink-0 text-right text-[9px] tabular-nums text-muted">{r.juz}</span>
              <div className="flex flex-1 flex-row-reverse gap-[2px]">
                {r.pages.map((p) => (
                  <Link
                    key={p.page}
                    href={mushafHref(p.page)}
                    aria-label={`Page ${p.page}: ${p.score === null ? 'not memorised yet' : `${p.learned} of ${p.total} ayahs memorised, ${toneOf(p)}`}`}
                    className={cn('h-3 min-w-0 flex-1 rounded-[2px]', TONE[toneOf(p)])}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        {(['strong', 'ok', 'shaky', 'weak', 'none'] as PageTone[]).map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className={cn('h-2.5 w-2.5 rounded-[2px]', TONE[t])} />
            {t === 'none' ? 'Not memorised' : t === 'ok' ? 'Holding' : t[0].toUpperCase() + t.slice(1)}
          </span>
        ))}
      </div>
    </Card>
  );
}
