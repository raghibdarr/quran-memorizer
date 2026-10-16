'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Surah } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';
import { recitationClockMs, setSleepTimer, startRecitation, stopRecitation } from '@/lib/recitation';
import { rangeUntil, type AyahRef, type PlayUntil } from '@/lib/recitation-queue';
import { pageOf } from '@/lib/search';
import { mushafHref } from '@/lib/routes';
import { useRecitation, useRecitationTransport } from '@/hooks/use-recitation';
import { activeJob, downloadSurah, isDownloaded, subscribeDownloads } from '@/lib/downloads';
import Link from '@/components/app-link';
import AyahDisplay from '@/components/ui/ayah-display';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import BottomSheet from '@/components/ui/bottom-sheet';
import SegmentedControl from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useSpokenWord } from '@/hooks/use-spoken-word';
import { cn } from '@/lib/cn';
import AyahMenu, { HIGHLIGHT_CLASS } from '@/components/reader/ayah-menu';
import { ayahKey, useReaderStore } from '@/stores/reader-store';

const REPEATS = [1, 3, 5, 10];
// Fixed pauses, or a multiple of the ayah just played ("x1": as long as the ayah)
const PAUSES: { value: string; label: string }[] = [
  { value: '0', label: 'None' },
  { value: '2000', label: '2s' },
  { value: '5000', label: '5s' },
  { value: 'x1', label: '1× ayah' },
  { value: 'x2', label: '2× ayah' },
];
const RANGE_REPEATS = [2, 3, 5, 0];
const UNTIL: { value: PlayUntil; label: string }[] = [
  { value: 'surah', label: 'Surah' },
  { value: 'juz', label: 'Juz' },
  { value: 'page', label: 'Page' },
  { value: 'quran', label: 'Quran' },
];
const SLEEP: { value: string; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: '15', label: '15m' },
  { value: '30', label: '30m' },
  { value: '60', label: '1h' },
  { value: 'item', label: 'Ayah end' },
];

type Meta = { counts: number[]; juz: [number, number][]; page: [number, number][]; names: Map<number, string> };
let metaPromise: Promise<Meta> | null = null;
function loadMeta(): Promise<Meta> {
  metaPromise ??= Promise.all([getSurahIndex(), import('@/data/quran-meta.json')]).then(([idx, m]) => {
    const sorted = [...idx].sort((a, b) => a.id - b.id);
    const meta = m.default as unknown as { juz: [number, number][]; page: [number, number][] };
    return { counts: sorted.map((x) => x.versesCount), juz: meta.juz, page: meta.page, names: new Map(sorted.map((x) => [x.id, x.nameSimple])) };
  });
  return metaPromise;
}

function sleepLabel(sleep: ReturnType<typeof useRecitation>['sleep'], now: number): string | null {
  if (sleep.kind === 'item') return 'Sleep at ayah end';
  if (sleep.kind === 'timer') return `Sleep in ${Math.max(1, Math.ceil((sleep.endsAt - now) / 60000))}m`;
  return null;
}

/** "Each ayah 3× · 2s pause · loop 5–9 ×3", or "Repeat: off" */
function repeatSummary(times: number, pauseMs: number, range: [number, number] | null, pauseFactor = 0, rangeRepeat = 0): string {
  const parts: string[] = [];
  if (times > 1) parts.push(`Each ayah ${times}×`);
  if (pauseFactor > 0) parts.push(`pause ${pauseFactor}× ayah`);
  else if (pauseMs > 0) parts.push(`${pauseMs / 1000}s pause`);
  if (range) parts.push(`loop ${range[0]}–${range[1]}${rangeRepeat ? ` ×${rangeRepeat}` : ''}`);
  return parts.length ? parts.join(' · ') : 'Repeat: off';
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onChange(value - 1)} aria-label={`${label}: earlier ayah`} className="pressable h-11 w-11 rounded-full bg-foreground/5 text-lg text-foreground">−</button>
        <span className="w-10 text-center text-sm font-semibold tabular-nums">{value + 1}</span>
        <button type="button" onClick={() => onChange(value + 1)} aria-label={`${label}: later ayah`} className="pressable h-11 w-11 rounded-full bg-foreground/5 text-lg text-foreground">+</button>
      </div>
    </div>
  );
}

/**
 * Read and listen to a whole surah with the text following along (persona tests:
 * there was no plain read-and-listen mode — listening meant a grading screen whose
 * current ayah sat under the player). Tap any ayah to play from there.
 *
 * Repeat & loop (M10): play each ayah N times with a pause after each (time to
 * say it back), and loop a range of ayahs A–B until stopped.
 *
 * Reading marks (roadmap #03): each ayah's ⋯ opens bookmark, highlight, note and
 * copy; the screen remembers where you were (`?a=` reopens there).
 *
 * Playback (roadmap #01) runs in src/lib/recitation.ts, outside this screen: it can
 * keep going to the end of a juz, a page or the Quran (the screen follows it from
 * surah to surah), with a sleep timer, and in the Android app natively, so it
 * carries on with the screen off and shows lock-screen controls.
 */
export default function ListenClient() {
  const params = useSearchParams();
  const surahId = Number(params.get('s'));
  const startAyah = Number(params.get('a')) || 0;
  const router = useRouter();
  const [surah, setSurah] = useState<Surah | null>(null);
  const [showRepeat, setShowRepeat] = useState(false);
  const rec = useRecitation();
  const transport = useRecitationTransport();
  const until = useSettingsStore((s) => s.listenUntil ?? 'surah');
  const wordByWord = useSettingsStore((s) => !!s.readerWordByWord);
  const toggleWordByWord = useSettingsStore((s) => s.toggleReaderWordByWord);
  const setListenUntil = useSettingsStore((s) => s.setListenUntil);
  const [now, setNow] = useState(() => Date.now());
  const [sleepChoice, setSleepChoice] = useState('off');
  const reciter = useSettingsStore((s) => s.reciter);
  const [, setDl] = useState(0);
  useEffect(() => subscribeDownloads(() => setDl((n) => n + 1)), []);
  const [dlError, setDlError] = useState(false);
  // Loop range, as ayah indexes; per visit, not saved
  const [range, setRange] = useState<[number, number] | null>(null);
  const times = useSettingsStore((s) => s.listenRepeat);
  const pauseMs = useSettingsStore((s) => s.listenPauseMs);
  const pauseFactor = useSettingsStore((s) => s.listenPauseFactor ?? 0);
  const rangeRepeat = useSettingsStore((s) => s.listenRangeRepeat ?? 0);
  const setListenRangeRepeat = useSettingsStore((s) => s.setListenRangeRepeat);
  const setListenRepeat = useSettingsStore((s) => s.setListenRepeat);
  // What's playing, as an index into this surah's ayahs
  const current = surah && rec.active && rec.surah === surah.id ? surah.ayahs.findIndex((a) => a.number === rec.ayah) : -1;
  const playingAll = rec.active;
  const spokenWord = useSpokenWord(surahId, current >= 0 && surah ? surah.ayahs[current].number : null, rec.playing, recitationClockMs);
  const ayahRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [menuIdx, setMenuIdx] = useState<number | null>(null);
  const bookmarks = useReaderStore((s) => s.bookmarks);
  const highlights = useReaderStore((s) => s.highlights);
  const notes = useReaderStore((s) => s.notes);
  const setLastRead = useReaderStore((s) => s.setLastRead);

  useEffect(() => {
    if (!Number.isFinite(surahId) || surahId < 1 || surahId > 114) return;
    let live = true;
    getSurah(surahId).then((s) => live && setSurah(s));
    return () => { live = false; };
  }, [surahId]);

  // Load what Play needs now, while online, so it's cached for offline listening
  useEffect(() => { void loadMeta(); }, []);

  // Leaving the screen stops the recitation
  useEffect(() => () => stopRecitation(), []);

  // Playing on past the surah: follow it to the next one
  useEffect(() => {
    if (rec.active && rec.surah && rec.surah !== surahId) router.replace(`/listen?s=${rec.surah}&a=${rec.ayah ?? 1}`);
  }, [rec.active, rec.surah, rec.ayah, surahId, router]);

  // The sleep countdown
  useEffect(() => {
    if (rec.sleep.kind !== 'timer') return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [rec.sleep.kind]);

  // Keep the ayah being recited in view, clear of the header and the player
  useEffect(() => {
    if (current < 0 || !surah) return;
    ayahRefs.current[current]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setLastRead(surah.id, surah.ayahs[current].number);
  }, [current, surah, setLastRead]);

  // Reopen where the link points (?a=), once the text is in
  useEffect(() => {
    if (!surah || startAyah < 2) return;
    const i = surah.ayahs.findIndex((a) => a.number === startAyah);
    if (i > 0) ayahRefs.current[i]?.scrollIntoView({ block: 'start' });
  }, [surah, startAyah]);

  // Remember the top-most ayah on screen as the last-read place (settles after a pause)
  useEffect(() => {
    if (!surah || typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const i = Number((e.target as HTMLElement).dataset.idx);
        if (e.isIntersecting) visible.add(i); else visible.delete(i);
      }
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (visible.size) setLastRead(surah.id, surah.ayahs[Math.min(...visible)].number);
      }, 1200);
    }, { rootMargin: '-96px 0px -55% 0px' });
    ayahRefs.current.forEach((el) => el && io.observe(el));
    return () => { io.disconnect(); clearTimeout(timer); };
  }, [surah, setLastRead]);

  const playFrom = useCallback(async (start: number) => {
    if (!surah) return;
    // Settings are read once per run, so changing them mid-play applies next time
    const { listenRepeat, listenPauseMs, listenPauseFactor, listenRangeRepeat, reciter, playbackSpeed, listenUntil } = useSettingsStore.getState();
    const meta = await loadMeta();
    let ayahs: AyahRef[];
    let startIndex = 0;
    if (range) {
      // Loop A–B within this surah
      const once = surah.ayahs.slice(range[0], range[1] + 1).map((a) => ({ surah: surah.id, ayah: a.number }));
      // A set number of passes over the range, or round and round until stopped
      ayahs = listenRangeRepeat ? Array.from({ length: listenRangeRepeat }, () => once).flat() : once;
      startIndex = Math.min(Math.max(start, range[0]), range[1]) - range[0];
    } else {
      ayahs = rangeUntil({ surah: surah.id, ayah: surah.ayahs[start].number }, listenUntil ?? 'surah', meta.counts, meta.juz, meta.page);
    }
    await startRecitation({
      ayahs,
      repeatEach: listenRepeat,
      pauseMs: listenPauseFactor ? 0 : listenPauseMs,
      pauseFactor: listenPauseFactor ?? 0,
      loop: !!range && !listenRangeRepeat,
      reciter,
      rate: playbackSpeed,
      surahName: (id) => meta.names.get(id) ?? `Surah ${id}`,
    }, startIndex);
  }, [surah, range]);

  const stop = useCallback(() => stopRecitation(), []);

  const playAyah = (i: number) => { void playFrom(i); };

  const inRange = (i: number) => !range || (i >= range[0] && i <= range[1]);
  const total = surah?.ayahs.length ?? 0;
  const setRangeEnd = (which: 0 | 1, idx: number) =>
    setRange((r) => {
      const next: [number, number] = r ? [...r] : [0, total - 1];
      next[which] = Math.max(0, Math.min(total - 1, idx));
      if (next[0] > next[1]) next[which === 0 ? 1 : 0] = next[which];
      return next;
    });

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback={`/lesson/${surahId}`} label="Close" />
          <span className="text-sm font-semibold text-teal">{surah ? surah.nameSimple : 'Read & listen'}</span>
          <div className="flex items-center gap-1">
            {surah && (
              <button
                type="button"
                onClick={async () => {
                  const meta = await loadMeta();
                  const top = current >= 0 ? surah.ayahs[current].number : (useReaderStore.getState().lastRead?.surah === surah.id ? useReaderStore.getState().lastRead!.ayah : 1);
                  router.push(mushafHref(pageOf({ page: meta.page, juz: meta.juz }, surah.id, top)));
                }}
                aria-label="Mushaf page view"
                className="flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
                data-page-view
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 5c3-1.5 7-1.5 10 1 3-2.5 7-2.5 10-1v14c-3-1.5-7-1.5-10 1-3-2.5-7-2.5-10-1z" /><line x1="12" y1="6" x2="12" y2="20" />
                </svg>
              </button>
            )}
            <SettingsPanel />
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!surah ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <p className="text-center text-sm text-muted">Tap an ayah to play from there. Its ⋯ has bookmarks and notes.</p>
              <button
                type="button"
                onClick={toggleWordByWord}
                aria-pressed={wordByWord}
                className={cn('pressable min-h-9 rounded-full px-3 text-xs font-semibold', wordByWord ? 'bg-teal text-on-teal' : 'bg-foreground/[0.06] text-foreground/80')}
                data-wbw-toggle
              >
                Word by word
              </button>
            </div>
            <div className="space-y-3">
              {surah.ayahs.map((ayah, i) => {
                const key = ayahKey(surah.id, ayah.number);
                const bookmarked = !!bookmarks[key] && !bookmarks[key].deleted;
                const hl = highlights[key] && !highlights[key].deleted ? highlights[key].color : null;
                const note = notes[key] && !notes[key].deleted ? notes[key].text : '';
                return (
                <div
                  key={ayah.key}
                  data-idx={i}
                  data-ayah={ayah.number}
                  ref={(el) => { ayahRefs.current[i] = el; }}
                  style={{ scrollMarginTop: 'calc(var(--safe-top) + 72px)' }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play from ayah ${ayah.number}`}
                  aria-current={i === current ? 'true' : undefined}
                  onClick={() => playAyah(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playAyah(i); } }}
                  className={cn(
                    'cursor-pointer rounded-2xl border-[1.5px] p-4 transition-colors',
                    i === current ? 'border-teal/60 bg-teal/5' : cn('border-transparent hover:border-foreground/10', hl ? HIGHLIGHT_CLASS[hl] : 'bg-card'),
                    !inRange(i) && 'opacity-50',
                  )}
                >
                  <div className="-mt-1 mb-1 flex items-center justify-between gap-2">
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      Ayah {ayah.number}
                      {bookmarked && (
                        <svg width={12} height={12} viewBox="0 0 24 24" className="text-gold" aria-label="Bookmarked" role="img">
                          <path d="M6 3h12v18l-6-4-6 4z" fill="currentColor" />
                        </svg>
                      )}
                      {i === current && times > 1 && <span className="text-teal"> · {rec.rep + 1} of {times}</span>}
                    </p>
                    <button
                      type="button"
                      aria-label={`Bookmark, highlight or note ayah ${ayah.number}`}
                      onClick={(e) => { e.stopPropagation(); setMenuIdx(i); }}
                      onKeyDown={(e) => e.stopPropagation()}
                      className="-mr-2 flex h-9 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
                      data-ayah-more
                    >
                      <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                    </button>
                  </div>
                  <AyahDisplay ayah={ayah} spokenWord={i === current ? spokenWord : -1} wordMeanings={wordByWord} />
                  {note && (
                    <p className="mt-3 line-clamp-3 whitespace-pre-line border-l-2 border-gold/50 pl-3 text-sm text-muted" data-ayah-note>
                      {note}
                    </p>
                  )}
                </div>
                );
              })}
            </div>

            <AyahMenu
              key={menuIdx ?? 'none'}
              open={menuIdx !== null}
              onClose={() => setMenuIdx(null)}
              surahId={surah.id}
              surahName={surah.nameSimple}
              ayah={menuIdx !== null ? surah.ayahs[menuIdx] : null}
              onPlay={() => menuIdx !== null && playAyah(menuIdx)}
            />

            <div className="sticky bottom-0 z-10 -mx-4 mt-4 space-y-2 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'var(--tabbar-clearance)' }}>
              <button
                type="button"
                onClick={() => setShowRepeat(true)}
                className={cn(
                  'pressable mx-auto flex min-h-11 items-center gap-2 rounded-full px-4 text-xs font-semibold',
                  times > 1 || pauseMs > 0 || pauseFactor > 0 || range ? 'bg-teal/10 text-teal' : 'bg-foreground/[0.06] text-foreground/80',
                )}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {repeatSummary(times, pauseMs, range && [surah.ayahs[range[0]].number, surah.ayahs[range[1]].number], pauseFactor, rangeRepeat)}
                {!range && until !== 'surah' && <span> · to end of {until === 'quran' ? 'the Quran' : until}</span>}
                {sleepLabel(rec.sleep, now) && <span> · {sleepLabel(rec.sleep, now)}</span>}
              </button>
              <MediaControlsBar
                className="static"
                transport={transport}
                playingAll={playingAll}
                currentIdx={current}
                total={surah.ayahs.length}
                idleLabel={range ? `Loop ayahs ${surah.ayahs[range[0]].number}–${surah.ayahs[range[1]].number}` : 'Play the whole surah'}
                onPlayAll={() => playFrom(current >= 0 ? current : range ? range[0] : 0)}
                onStop={stop}
                onRestart={() => { stop(); setTimeout(() => playFrom(range ? range[0] : 0), 60); }}
              />
            </div>

            <BottomSheet open={showRepeat} onClose={() => setShowRepeat(false)} title="Playback" doneButton>
              <div className="space-y-5 pb-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Play each ayah</p>
                  <SegmentedControl
                    options={REPEATS.map((n) => ({ value: String(n), label: `${n}×` }))}
                    value={String(times)}
                    onChange={(v) => setListenRepeat(Number(v), pauseMs, pauseFactor)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Pause after each, to say it back</p>
                  <SegmentedControl
                    options={PAUSES}
                    value={pauseFactor ? `x${pauseFactor}` : String(pauseMs)}
                    onChange={(v) => (v.startsWith('x') ? setListenRepeat(times, 0, Number(v.slice(1))) : setListenRepeat(times, Number(v), 0))}
                  />
                </div>
                <div className="space-y-3">
                  <label className="flex min-h-11 items-center justify-between">
                    <span className="text-sm text-foreground">Loop a range of ayahs</span>
                    <input
                      type="checkbox"
                      checked={!!range}
                      onChange={(e) => setRange(e.target.checked ? [Math.max(0, current), total - 1] : null)}
                      className="h-5 w-5 accent-[var(--color-teal)]"
                    />
                  </label>
                  {range && (
                    <div className="space-y-2 rounded-xl bg-foreground/[0.03] p-3">
                      <Stepper label="From ayah" value={range[0]} onChange={(v) => setRangeEnd(0, v)} />
                      <Stepper label="To ayah" value={range[1]} onChange={(v) => setRangeEnd(1, v)} />
                      <div className="pt-1">
                        <p className="mb-2 text-xs font-medium text-muted">Play the range</p>
                        <SegmentedControl
                          options={RANGE_REPEATS.map((n) => ({ value: String(n), label: n ? `${n}×` : 'Until stopped' }))}
                          value={String(rangeRepeat)}
                          onChange={(v) => setListenRangeRepeat(Number(v))}
                        />
                      </div>
                    </div>
                  )}
                </div>
                {!range && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted">Keep playing to the end of the</p>
                    <SegmentedControl options={UNTIL} value={until} onChange={(v) => setListenUntil(v as PlayUntil)} />
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Sleep timer{rec.sleep.kind === 'timer' ? ` · ${sleepLabel(rec.sleep, now)?.replace('Sleep in ', '')} left` : ''}</p>
                  {rec.active ? (
                    <SegmentedControl
                      options={SLEEP}
                      value={rec.sleep.kind === 'off' ? 'off' : sleepChoice}
                      onChange={(v) => { setNow(Date.now()); setSleepChoice(v); setSleepTimer(v === 'off' ? null : v === 'item' ? 'item' : Number(v)); }}
                    />
                  ) : (
                    <p className="text-xs text-muted">Start playing to set one.</p>
                  )}
                </div>
                <div className="flex min-h-11 items-center justify-between gap-3 rounded-xl bg-foreground/[0.03] px-3 py-2" data-surah-download>
                  {isDownloaded(reciter, surah.id) ? (
                    <span className="text-sm text-foreground">Downloaded: plays offline</span>
                  ) : activeJob(reciter, surah.id) ? (
                    <span className="text-sm text-muted">Downloading {activeJob(reciter, surah.id)!.done} of {activeJob(reciter, surah.id)!.total}…</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setDlError(false); downloadSurah(reciter, surah.id, surah.ayahs.length).catch(() => setDlError(true)); }}
                      className="text-sm font-semibold text-teal"
                    >
                      {dlError ? "Couldn't download. Try again" : 'Download this surah for offline'}
                    </button>
                  )}
                  <Link href="/downloads" className="shrink-0 text-xs text-muted underline underline-offset-2">All downloads</Link>
                </div>
                <p className="text-xs text-muted">Repeat, pause and play-to changes apply the next time you press play.</p>
              </div>
            </BottomSheet>
          </>
        )}
      </main>
    </div>
  );
}
