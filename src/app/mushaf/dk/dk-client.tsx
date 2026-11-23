'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { SurahMeta } from '@/types/quran';
import { getSurahIndex } from '@/lib/quran-data';
import { loadMushafDk, type MushafDkEngine } from '@/lib/mushaf-dk/engine';
import { layoutPage, type PlacedPage } from '@/lib/mushaf-dk/layout';
import { MUSHAF_DK_PAGES } from '@/lib/mushaf-dk/text';
import DkPage from '@/components/mushaf/dk-page';
import CloseButton from '@/components/ui/close-button';

declare global {
  interface Window {
    /** Timings for the prototype's measurements (Playwright reads these) */
    __mushafDk?: { page: number; loadMs: number; layoutMs: number; renderMs: number; squeezed: number; minXScale: number };
  }
}

const href = (page: number, fit: string | null) => `/mushaf/dk?page=${page}${fit ? `&fit=${fit}` : ''}`;

/**
 * Prototype (branch mushaf/prototype): a Madina page set by DigitalKhatt's
 * justification — the print's 15 lines and line breaks, each line stretched to
 * the same width with kashidas and wider letter forms. `?fit=squeeze` shows
 * digitalkhatt.org's own settings (full size, over-long lines squeezed) to compare.
 */
export default function MushafDkClient() {
  const router = useRouter();
  const params = useSearchParams();
  const requested = Number(params.get('page'));
  const pageNo = Number.isInteger(requested) && requested >= 1 && requested <= MUSHAF_DK_PAGES ? requested : 1;
  const fit = params.get('fit') === 'squeeze' ? 'squeeze' : null;
  const debug = params.has('debug');

  const [engine, setEngine] = useState<MushafDkEngine | null>(null);
  const [failed, setFailed] = useState(false);
  const [names, setNames] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    loadMushafDk().then(setEngine, () => setFailed(true));
    getSurahIndex().then((idx: SurahMeta[]) => setNames(new Map(idx.map((s) => [s.id, s.nameSimple])))).catch(() => {});
  }, []);

  const placed: PlacedPage | null = useMemo(() => {
    if (!engine) return null;
    const refs = engine.index[pageNo - 1].lines.map((l) => l.words);
    return layoutPage(engine.font, engine.pages, pageNo, refs, fit ? { overflow: 'squeeze', fontScale: 1 } : {});
  }, [engine, pageNo, fit]);

  // Paint time: from React committing the SVG to the next frame
  const [renderMs, setRenderMs] = useState<number | null>(null);
  useEffect(() => {
    if (!placed || !engine) return;
    const start = performance.now();
    const id = requestAnimationFrame(() => {
      const ms = performance.now() - start;
      setRenderMs(ms);
      const text = placed.lines.filter((l) => l.target > 0);
      window.__mushafDk = {
        page: placed.page,
        loadMs: engine.loadMs,
        layoutMs: placed.ms,
        renderMs: ms,
        squeezed: text.filter((l) => l.xScale < 1).length,
        minXScale: Math.min(1, ...text.map((l) => l.xScale)),
      };
      document.documentElement.dataset.mushafDkReady = String(placed.page);
    });
    return () => cancelAnimationFrame(id);
  }, [placed, engine]);

  const go = useCallback((n: number) => {
    if (n < 1 || n > MUSHAF_DK_PAGES) return;
    router.replace(href(n, fit));
  }, [router, fit]);

  // Arrow keys: left is the next page in a right-to-left book
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') go(pageNo + 1);
      if (e.key === 'ArrowRight') go(pageNo - 1);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [go, pageNo]);

  // Swipe: dragging the page to the right turns to the next page
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touch.current;
    touch.current = null;
    if (!t) return;
    const dx = e.changedTouches[0].clientX - t.x;
    const dy = e.changedTouches[0].clientY - t.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    go(dx > 0 ? pageNo + 1 : pageNo - 1);
  };

  const entry = engine?.index[pageNo - 1];
  const surahsHere = entry
    ? [...new Set(entry.lines.flatMap((l) => l.words.map((w) => w.surah)))].map((s) => names.get(s)).filter(Boolean).join(' · ')
    : '';
  const label = engine ? engine.pages[pageNo - 1].join('\n') : undefined;

  const arrow = (dir: 'next' | 'prev') => (
    <button
      type="button"
      onClick={() => go(dir === 'next' ? pageNo + 1 : pageNo - 1)}
      disabled={dir === 'next' ? pageNo >= MUSHAF_DK_PAGES : pageNo <= 1}
      aria-label={dir === 'next' ? 'Next page' : 'Previous page'}
      className="flex h-11 w-11 items-center justify-center rounded-full text-teal hover:bg-foreground/5 disabled:opacity-30"
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {dir === 'next' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-3 py-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-1">
          <CloseButton fallback="/mushaf" label="Close" />
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-teal">{surahsHere || 'Mushaf'}</p>
            <p className="text-[11px] text-muted">Page {pageNo} · DigitalKhatt prototype{fit ? ' · squeeze' : ''}</p>
          </div>
          <div className="flex items-center">
            {arrow('next')}
            {arrow('prev')}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-xl px-2 pb-8 pt-2" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {failed ? (
          <p className="py-16 text-center text-sm text-muted">The mushaf couldn&apos;t load. Check your connection and try again.</p>
        ) : placed ? (
          <div className="rounded-xl bg-card px-1 py-1 shadow-sm" dir="rtl" lang="ar">
            <DkPage placed={placed} glyphPath={(id) => engine!.font.glyphPath(id)} label={label} />
          </div>
        ) : (
          <div className="aspect-[255/410] w-full animate-pulse rounded-xl bg-card" aria-label="Loading page" />
        )}
        <p className="mt-2 text-center text-xs text-muted tabular-nums">
          {pageNo}
          {debug && engine && placed && renderMs !== null && (
            <span> · load {engine.loadMs.toFixed(0)} ms · layout {placed.ms.toFixed(1)} ms · paint {renderMs.toFixed(1)} ms</span>
          )}
        </p>
      </main>
    </div>
  );
}
