'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Ayah, SurahMeta } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { ayahsOnPage, buildPage, juzFilesForPage, loadJuzFile, MUSHAF_LINE_WIDTH, MUSHAF_PAGES, type MushafPage as Page, type MushafWord } from '@/lib/mushaf';
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

async function loadPage(page: number, meta: Meta): Promise<Page | null> {
  const files = await Promise.all(juzFilesForPage(page, meta.juzStartPages).map(loadJuzFile));
  return buildPage(page, files);
}

/** Staying this long on a page counts it as read for a khatm */
const PAGE_READ_MS = 12_000;

const juzOf = (meta: Meta, page: number) => meta.juzStartPages.filter((p) => p <= page).length;

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

  const pageNo = Number.isInteger(requested) && requested >= 1 && requested <= MUSHAF_PAGES
    ? requested
    : meta && lastRead ? pageOf(meta, lastRead.surah, lastRead.ayah) : 1;

  useEffect(() => { loadMeta().then(setMeta); }, []);

  useEffect(() => {
    if (!meta) return;
    let live = true;
    loadPage(pageNo, meta).then((p) => { if (live) setPage(p); }).catch(() => { if (live) setFailedPage(pageNo); });
    // Warm the neighbours so turning is instant
    for (const n of [pageNo - 1, pageNo + 1]) if (n >= 1 && n <= MUSHAF_PAGES) void loadPage(n, meta).catch(() => {});
    return () => { live = false; };
  }, [pageNo, meta]);

  const ayahs = useMemo(() => (page && page.page === pageNo ? ayahsOnPage(page) : []), [page, pageNo]);

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
    const t = setTimeout(() => markPagesRead([pageNo]), PAGE_READ_MS);
    return () => clearTimeout(t);
  }, [khatmActive, ayahs.length, pageNo, markPagesRead]);

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
  const fontSize = Math.max(14, Math.min(width / (MUSHAF_LINE_WIDTH + 0.6), room / (15 * 1.8)));

  const go = useCallback((n: number) => {
    if (n < 1 || n > MUSHAF_PAGES) return;
    router.replace(mushafHref(n));
  }, [router]);

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
    if (!meta || !rec.active || !rec.surah || !rec.ayah) return;
    const p = pageOf(meta, rec.surah, rec.ayah);
    if (p !== pageNo) go(p);
  }, [meta, rec.active, rec.surah, rec.ayah, pageNo, go]);

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

  const markWord = useCallback((w: MushafWord): WordMark => {
    if (rec.active && w.surah === rec.surah && w.ayah === rec.ayah) {
      return spoken >= 0 && w.wordNo === spoken + 1 ? 'spoken' : 'playing';
    }
    if (markSimilar && twinWords && w.ayah !== null && w.wordNo && twinWords.get(`${w.surah}:${w.ayah}`)?.has(w.wordNo - 1)) return 'flag';
    return null;
  }, [rec.active, rec.surah, rec.ayah, spoken, markSimilar, twinWords]);

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
              {meta ? `Juz ${juzOf(meta, pageNo)} · Page ${pageNo}` : `Page ${pageNo}`}
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
                onAyahTap={(s, a) => void openAyah(s, a)}
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
              disabled={pageNo >= MUSHAF_PAGES}
              className="pressable flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-teal disabled:opacity-30"
              aria-label="Next page"
            >
              ‹ {pageNo < MUSHAF_PAGES ? pageNo + 1 : ''}
            </button>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMarkSimilar}
                aria-pressed={markSimilar}
                className={cn('min-h-9 rounded-full px-3 text-xs font-semibold', markSimilar ? 'bg-gold/20 text-gold-deep' : 'bg-foreground/[0.06] text-foreground/80')}
                data-mark-similar
              >
                Similar ayahs
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
