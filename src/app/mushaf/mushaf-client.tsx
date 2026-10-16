'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Ayah, SurahMeta } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { ayahsOnPage, buildPage, juzFilesForPage, LAYOUTS, loadJuzFile, loadLayoutIndex, type LayoutIndex, type MushafLayout, type MushafPage as Page, type MushafWord } from '@/lib/mushaf';
import { pageOf, type QuranMeta } from '@/lib/search';
import { listenHref, mushafHref } from '@/lib/routes';
import { rangeUntil } from '@/lib/recitation-queue';
import { recitationClockMs, startRecitation, stopRecitation } from '@/lib/recitation';
import { useRecitation, useRecitationTransport } from '@/hooks/use-recitation';
import { useSpokenWord } from '@/hooks/use-spoken-word';
import { useSettingsStore } from '@/stores/settings-store';
import { ayahKey, useReaderStore } from '@/stores/reader-store';
import MushafPageView, { type WordMark } from '@/components/mushaf/mushaf-page';
import AyahMenu, { HIGHLIGHT_CLASS } from '@/components/reader/ayah-menu';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import Link from '@/components/app-link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';
import { RecallBar, usePageRecall, type RecallMode } from '@/components/mushaf/page-recall';
import SegmentedControl from '@/components/ui/segmented-control';
import { useReviewStore } from '@/stores/review-store';
import { ayahInk, inkMap } from '@/lib/memory-ink';

type Meta = QuranMeta & { counts: number[]; names: Map<number, string>; juzStartPages: number[] };
let metaPromise: Promise<Meta> | null = null;
function loadMeta(): Promise<Meta> {
  metaPromise ??= Promise.all([getSurahIndex(), import('@/data/quran-meta.json')]).then(([idx, raw]) => {
    const m = raw.default as unknown as QuranMeta;
    const sorted = [...idx].sort((a: SurahMeta, b: SurahMeta) => a.id - b.id);
    return {
      ...m,
      counts: sorted.map((s) => s.versesCount),
      names: new Map(sorted.map((s) => [s.id, s.nameSimple])),
      juzStartPages: m.juz.map(([s, a]) => pageOf(m, s, a)),
    };
  });
  return metaPromise;
}

async function loadPage(page: number, layout: MushafLayout, index: LayoutIndex): Promise<Page | null> {
  const files = await Promise.all(juzFilesForPage(page, index.juzStartPages, LAYOUTS[layout].pages).map((j) => loadJuzFile(j, layout)));
  return buildPage(page, files);
}

/** The page an ayah is on in a layout */
const pageIn = (index: LayoutIndex, surah: number, ayah: number) => pageOf({ page: index.pageStarts, juz: [] }, surah, ayah);

/** Staying this long on a page counts it as read for a khatm */
const PAGE_READ_MS = 12_000;

const juzOf = (index: LayoutIndex, page: number) => index.juzStartPages.filter((p) => p <= page).length;

/**
 * The Madina mushaf, a page at a time (roadmap #06). Swipe or use the arrows to turn
 * pages (right to left, as in the print); tap an ayah for bookmarks, notes and
 * "play from here". Playback follows the recitation from page to page.
 */
export default function MushafClient() {
  const router = useRouter();
  const params = useSearchParams();
  const lastRead = useReaderStore((s) => s.lastRead);
  const requested = Number(params.get('p'));
  const [meta, setMeta] = useState<Meta | null>(null);
  const layout = useSettingsStore((s) => s.mushafLayout ?? 'madina');
  const setLayout = useSettingsStore((s) => s.setMushafLayout);
  const L = LAYOUTS[layout];
  const [index, setIndex] = useState<{ layout: MushafLayout; index: LayoutIndex } | null>(null);
  const idx = index && index.layout === layout ? index.index : null;
  useEffect(() => { loadLayoutIndex(layout).then((i) => setIndex({ layout, index: i })).catch(() => {}); }, [layout]);
  const [page, setPage] = useState<Page | null>(null);
  const [failedPage, setFailedPage] = useState<number | null>(null);
  const [width, setWidth] = useState(360);
  const [menu, setMenu] = useState<{ surahName: string; surah: number; ayah: Ayah } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const rec = useRecitation();
  const transport = useRecitationTransport();
  const bookmarks = useReaderStore((s) => s.bookmarks);
  const highlights = useReaderStore((s) => s.highlights);
  const setLastRead = useReaderStore((s) => s.setLastRead);

  const pageNo = Number.isInteger(requested) && requested >= 1 && requested <= L.pages
    ? requested
    : idx && lastRead ? pageIn(idx, lastRead.surah, lastRead.ayah) : 1;

  useEffect(() => { loadMeta().then(setMeta); }, []);

  useEffect(() => {
    if (!idx) return;
    let live = true;
    loadPage(pageNo, layout, idx).then((p) => { if (live) setPage(p); }).catch(() => { if (live) setFailedPage(pageNo); });
    // Warm the neighbours so turning is instant
    for (const n of [pageNo - 1, pageNo + 1]) if (n >= 1 && n <= L.pages) void loadPage(n, layout, idx).catch(() => {});
    return () => { live = false; };
  }, [pageNo, layout, idx, L.pages]);

  const ayahs = useMemo(() => (page && page.page === pageNo ? ayahsOnPage(page) : []), [page, pageNo]);
  const recall = usePageRecall(page && page.page === pageNo ? page : null);
  // The voice check stays inside the page's ayahs when they're all one surah's
  const passage = ayahs.length && ayahs.every((a) => a.surah === ayahs[0].surah)
    ? { surah: ayahs[0].surah, ayah: ayahs[0].ayah, ayahEnd: ayahs[ayahs.length - 1].ayah }
    : null;

  // This page is where you are
  useEffect(() => {
    if (ayahs.length) setLastRead(ayahs[0].surah, ayahs[0].ayah, 'page');
  }, [ayahs, setLastRead]);

  // A khatm counts a page as read once you've stayed on it a little while
  const khatmActive = useReaderStore((s) => !!s.khatm && !s.khatm.endedAt);
  const markPagesRead = useReaderStore((s) => s.markPagesRead);
  const pageRead = useReaderStore((s) => !!s.khatm && !s.khatm.endedAt && !!s.khatm.pagesRead[String(pageNo)]);
  useEffect(() => {
    if (!khatmActive || !ayahs.length) return;
    const t = setTimeout(() => {
      if (layout === 'madina') { markPagesRead([pageNo]); return; }
      // Another layout: the khatm counts the Madina pages this page's ayahs cover
      if (!meta || !ayahs.length) return;
      const first = pageOf(meta, ayahs[0].surah, ayahs[0].ayah);
      const last = pageOf(meta, ayahs[ayahs.length - 1].surah, ayahs[ayahs.length - 1].ayah);
      markPagesRead(Array.from({ length: last - first + 1 }, (_, i) => first + i));
    }, PAGE_READ_MS);
    return () => clearTimeout(t);
  }, [khatmActive, ayahs, pageNo, markPagesRead, layout, meta]);

  // Fit the page to the screen: a line is MUSHAF_LINE_WIDTH em, a page 15 lines of 1.8em
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // …and to the height left between the header and the controls
  const headerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(560);
  const [controlsH, setControlsH] = useState(160);
  useEffect(() => {
    const measure = () => {
      const c = controlsRef.current?.offsetHeight ?? 160;
      setControlsH(c);
      setRoom(window.innerHeight - (headerRef.current?.offsetHeight ?? 60) - c - 56);
    };
    measure();
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (headerRef.current) ro?.observe(headerRef.current);
    if (controlsRef.current) ro?.observe(controlsRef.current);
    window.addEventListener('resize', measure);
    return () => { ro?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const fontSize = Math.max(14, Math.min(width / (L.lineWidth + 0.6), room / (15 * 1.8)));

  const go = useCallback((n: number) => {
    if (n < 1 || n > L.pages) return;
    router.replace(mushafHref(n));
  }, [router, L.pages]);

  // Arrow keys: left is the next page in a right-to-left book
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
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

  // Leaving the screen stops the recitation; playing past the page turns it
  useEffect(() => () => stopRecitation(), []);
  useEffect(() => {
    if (!idx || !rec.active || !rec.surah || !rec.ayah) return;
    const p = pageIn(idx, rec.surah, rec.ayah);
    if (p !== pageNo) go(p);
  }, [idx, rec.active, rec.surah, rec.ayah, pageNo, go]);

  // Words that differ from a near-twin ayah (mutashabihat), when that's switched on
  const markSimilar = useSettingsStore((s) => !!s.mushafMarkSimilar);
  const toggleMarkSimilar = useSettingsStore((s) => s.toggleMushafMarkSimilar);
  const [twinWords, setTwinWords] = useState<Map<string, Set<number>> | null>(null);
  useEffect(() => {
    if (!markSimilar || twinWords) return;
    import('@/data/mutashabihat.json').then((m) => {
      const data = (m.default ?? m) as unknown as Record<string, { d: number[] }[]>;
      const map = new Map<string, Set<number>>();
      for (const [k, list] of Object.entries(data)) map.set(k, new Set(list.flatMap((t) => t.d)));
      setTwinWords(map);
    });
  }, [markSimilar, twinWords]);

  const spoken = useSpokenWord(rec.surah ?? 0, rec.active ? rec.ayah : null, rec.playing, recitationClockMs);

  const recallMark = recall.markFor;
  const markWord = useCallback((w: MushafWord): WordMark => {
    const r = recallMark(w);
    if (r) return r;
    if (rec.active && w.surah === rec.surah && w.ayah === rec.ayah) {
      return spoken >= 0 && w.wordNo === spoken + 1 ? 'spoken' : 'playing';
    }
    if (markSimilar && twinWords && w.ayah !== null && w.wordNo && twinWords.get(`${w.surah}:${w.ayah}`)?.has(w.wordNo - 1)) return 'flag';
    return null;
  }, [rec.active, rec.surah, rec.ayah, spoken, markSimilar, twinWords, recallMark]);

  // Memory ink (V2): each ayah as darkly as it's held, from its review card
  const memoryInk = useSettingsStore((s) => !!s.mushafMemoryInk);
  const toggleMemoryInk = useSettingsStore((s) => s.toggleMushafMemoryInk);
  const reviewCards = useReviewStore((s) => s.cards);
  const inks = useMemo(() => (memoryInk ? inkMap(reviewCards) : null), [memoryInk, reviewCards]);
  const ayahInkOf = useCallback((surah: number, ayah: number) => (inks ? inks.get(`${surah}:${ayah}`) ?? ayahInk(undefined) : null), [inks]);

  const ayahTint = useCallback((surah: number, ayah: number) => {
    const h = highlights[ayahKey(surah, ayah)];
    return h && !h.deleted ? HIGHLIGHT_CLASS[h.color] : null;
  }, [highlights]);

  const playFrom = useCallback(async (surah: number, ayah: number) => {
    const m = meta ?? await loadMeta();
    const { listenRepeat, listenPauseMs, listenPauseFactor, reciter, playbackSpeed, listenUntil } = useSettingsStore.getState();
    // On the page view, "the surah" still means the surah; most people turn pages surah by surah
    await startRecitation({
      ayahs: rangeUntil({ surah, ayah }, listenUntil ?? 'surah', m.counts, m.juz, m.page),
      repeatEach: listenRepeat,
      pauseMs: listenPauseFactor ? 0 : listenPauseMs,
      pauseFactor: listenPauseFactor ?? 0,
      loop: false,
      reciter,
      rate: playbackSpeed,
      surahName: (id) => m.names.get(id) ?? `Surah ${id}`,
    });
  }, [meta]);

  const openAyah = useCallback(async (surah: number, ayah: number) => {
    const s = await getSurah(surah);
    const a = s.ayahs.find((x) => x.number === ayah);
    if (a) setMenu({ surahName: s.nameSimple, surah, ayah: a });
  }, []);

  const surahsHere = [...new Set(ayahs.map((a) => a.surah))].map((s) => meta?.names.get(s)).filter(Boolean).join(' · ');
  const first = ayahs[0];
  const bookmarkedHere = ayahs.some((a) => { const b = bookmarks[ayahKey(a.surah, a.ayah)]; return b && !b.deleted; });

  return (
    <div className="min-h-dvh bg-cream">
      <div ref={headerRef} className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-2.5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <CloseButton fallback="/" label="Close" />
          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-semibold text-teal">{surahsHere || 'Mushaf'}</p>
            <p className="text-[11px] text-muted">
              {idx ? `Juz ${juzOf(idx, pageNo)} · Page ${pageNo}` : `Page ${pageNo}`}{layout !== 'madina' && ` · ${L.label}`}
              {bookmarkedHere && <span className="text-gold-deep"> · bookmarked</span>}
              {pageRead && <span className="text-success"> · read ✓</span>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {first && (
              <Link
                href={`${listenHref(first.surah)}&a=${first.ayah}`}
                aria-label="Ayah by ayah view"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              </Link>
            )}
            <SettingsPanel />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-2 pt-3" style={{ paddingBottom: controlsH + 12 }}>
        <div ref={boxRef} className="w-full" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          {failedPage === pageNo && !(page && page.page === pageNo) ? (
            <p className="py-16 text-center text-sm text-muted">This page couldn&apos;t load. Check your connection and try again.</p>
          ) : page && page.page === pageNo ? (
            <div className="rounded-2xl bg-card py-3 shadow-sm" aria-label={`Page ${pageNo}`}>
              <MushafPageView
                page={page}
                fontSize={fontSize}
                markWord={markWord}
                ayahTint={ayahTint}
                ayahInk={ayahInkOf}
                onAyahTap={(s, a) => void openAyah(s, a)}
                onWordTap={recall.mode !== 'read' ? (w) => recall.peek([w]) : undefined}
                font={L.font}
                lineWidth={L.lineWidth}
              />
              <p className="mt-1 text-center text-xs tabular-nums text-muted">{pageNo}</p>
            </div>
          ) : (
            <Skeleton className="mx-auto h-[70dvh] w-full rounded-2xl" />
          )}
        </div>
      </main>

      <div ref={controlsRef} className="fixed inset-x-0 bottom-0 z-20 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'var(--tabbar-clearance)' }}>
        <div className="mx-auto max-w-2xl space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => go(pageNo + 1)}
              disabled={pageNo >= L.pages}
              className="pressable flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-teal disabled:opacity-30"
              aria-label="Next page"
            >
              ‹ {pageNo < L.pages ? pageNo + 1 : ''}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMarkSimilar}
                aria-pressed={markSimilar}
                className={cn('min-h-9 rounded-full px-3 text-xs font-semibold', markSimilar ? 'bg-gold/20 text-gold-deep' : 'bg-foreground/[0.06] text-foreground/80')}
                data-mark-similar
              >
                Similar
              </button>
              <button
                type="button"
                onClick={toggleMemoryInk}
                aria-pressed={memoryInk}
                title="Print each ayah as darkly as you hold it"
                className={cn('min-h-9 rounded-full px-3 text-xs font-semibold', memoryInk ? 'bg-teal/15 text-teal' : 'bg-foreground/[0.06] text-foreground/80')}
                data-memory-ink
              >
                Ink
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next: MushafLayout = layout === 'madina' ? 'indopak' : 'madina';
                  const first = ayahs[0];
                  setLayout(next);
                  if (first) router.replace(mushafHref(pageIn(await loadLayoutIndex(next), first.surah, first.ayah)));
                }}
                className="min-h-9 rounded-full bg-foreground/[0.06] px-3 text-xs font-semibold text-foreground/80"
                aria-label={`Switch to the ${layout === 'madina' ? 'IndoPak' : 'Madina'} mushaf`}
                data-layout-switch
              >
                {layout === 'madina' ? 'IndoPak' : 'Madina'}
              </button>
              {!khatmActive && <Link href="/khatm" className="text-xs font-semibold text-teal underline-offset-2 hover:underline">Plan a khatm</Link>}
            </div>
            <button
              type="button"
              onClick={() => go(pageNo - 1)}
              disabled={pageNo <= 1}
              className="pressable flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-teal disabled:opacity-30"
              aria-label="Previous page"
            >
              {pageNo > 1 ? pageNo - 1 : ''} ›
            </button>
          </div>
          <SegmentedControl
            options={[{ value: 'read', label: 'Read' }, { value: 'hide', label: 'Recite: hidden' }, { value: 'hint', label: 'First letters' }]}
            value={recall.mode}
            onChange={(v) => { stopRecitation(); recall.setMode(v as RecallMode); }}
          />
          {recall.mode !== 'read' ? (
            <RecallBar recall={recall} passage={passage} pageNo={pageNo} />
          ) : (
          <MediaControlsBar
            className="static"
            transport={transport}
            playingAll={rec.active}
            currentIdx={-1}
            total={0}
            idleLabel={first ? `Play from ${meta?.names.get(first.surah) ?? ''} ${first.surah}:${first.ayah}` : 'Play'}
            onPlayAll={() => first && void playFrom(first.surah, first.ayah)}
            onStop={() => stopRecitation()}
          />
          )}
        </div>
      </div>

      <AyahMenu
        key={menu ? `${menu.surah}:${menu.ayah.number}` : 'none'}
        open={!!menu}
        onClose={() => setMenu(null)}
        surahId={menu?.surah ?? 1}
        surahName={menu?.surahName ?? ''}
        ayah={menu?.ayah ?? null}
        onPlay={() => menu && void playFrom(menu.surah, menu.ayah.number)}
      />
    </div>
  );
}
