'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Surah } from '@/types/quran';
import { getAudioUrl, getSurah } from '@/lib/quran-data';
import { audioController } from '@/lib/audio';
import { useSettingsStore } from '@/stores/settings-store';
import AyahDisplay from '@/components/ui/ayah-display';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import BottomSheet from '@/components/ui/bottom-sheet';
import SegmentedControl from '@/components/ui/segmented-control';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAudio } from '@/hooks/use-audio';
import { useSpokenWord } from '@/hooks/use-spoken-word';
import { cn } from '@/lib/cn';
import AyahMenu, { HIGHLIGHT_CLASS } from '@/components/reader/ayah-menu';
import { ayahKey, useReaderStore } from '@/stores/reader-store';

const GAP_BETWEEN_AYAHS_MS = 300;
/** Between repeats of the same ayah when no pause is set: enough to hear it as a repeat */
const GAP_BETWEEN_REPEATS_MS = 600;

const REPEATS = [1, 3, 5, 10];
const PAUSES = [0, 2000, 5000, 10000];

/** "Each ayah 3× · 2s pause · loop 5–9", or "Repeat: off" */
function repeatSummary(times: number, pauseMs: number, range: [number, number] | null): string {
  const parts: string[] = [];
  if (times > 1) parts.push(`Each ayah ${times}×`);
  if (pauseMs > 0) parts.push(`${pauseMs / 1000}s pause`);
  if (range) parts.push(`loop ${range[0]}–${range[1]}`);
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
 */
export default function ListenClient() {
  const params = useSearchParams();
  const surahId = Number(params.get('s'));
  const startAyah = Number(params.get('a')) || 0;
  const [surah, setSurah] = useState<Surah | null>(null);
  const [current, setCurrent] = useState(-1);
  const [rep, setRep] = useState(0);
  const [playingAll, setPlayingAll] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  // Loop range, as ayah indexes; per visit, not saved
  const [range, setRange] = useState<[number, number] | null>(null);
  const times = useSettingsStore((s) => s.listenRepeat);
  const pauseMs = useSettingsStore((s) => s.listenPauseMs);
  const setListenRepeat = useSettingsStore((s) => s.setListenRepeat);
  const { isPlaying } = useAudio();
  const spokenWord = useSpokenWord(surahId, surah && current >= 0 ? surah.ayahs[current].number : null, isPlaying);
  const abortRef = useRef(false);
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

  useEffect(() => () => { abortRef.current = true; audioController.stop(); }, []);

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

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const playFrom = useCallback(async (start: number) => {
    if (!surah) return;
    abortRef.current = false;
    setPlayingAll(true);
    // Settings are read once per run, so changing them mid-play applies next time
    const { listenRepeat: n, listenPauseMs: pause, reciter } = useSettingsStore.getState();
    const [lo, hi] = range ?? [0, surah.ayahs.length - 1];
    let i = Math.min(Math.max(start, lo), hi);
    while (!abortRef.current) {
      for (let r = 0; r < n && !abortRef.current; r++) {
        setCurrent(i);
        setRep(r);
        await audioController.playAndWait(getAudioUrl(surah.id, surah.ayahs[i].number, reciter));
        if (abortRef.current) break;
        const last = !range && i === hi && r === n - 1;
        if (!last) await wait(pause > 0 ? pause : r < n - 1 ? GAP_BETWEEN_REPEATS_MS : GAP_BETWEEN_AYAHS_MS);
      }
      if (abortRef.current) break;
      if (i < hi) i++;
      else if (range) i = lo; // loop the range until stopped
      else break;
    }
    if (!abortRef.current) setCurrent(-1);
    setPlayingAll(false);
  }, [surah, range]);

  const stop = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
  }, []);

  const playAyah = (i: number) => {
    stop();
    setTimeout(() => playFrom(i), 60);
  };

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
          <SettingsPanel />
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!surah ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-muted">Tap an ayah to play from there. Its ⋯ has bookmarks and notes.</p>
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
                      {i === current && times > 1 && <span className="text-teal"> · {rep + 1} of {times}</span>}
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
                  <AyahDisplay ayah={ayah} spokenWord={i === current ? spokenWord : -1} />
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
                  times > 1 || pauseMs > 0 || range ? 'bg-teal/10 text-teal' : 'bg-foreground/[0.06] text-foreground/80',
                )}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M17 1l4 4-4 4" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><path d="M7 23l-4-4 4-4" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
                {repeatSummary(times, pauseMs, range && [surah.ayahs[range[0]].number, surah.ayahs[range[1]].number])}
              </button>
              <MediaControlsBar
                className="static"
                playingAll={playingAll}
                currentIdx={current}
                total={surah.ayahs.length}
                idleLabel={range ? `Loop ayahs ${surah.ayahs[range[0]].number}–${surah.ayahs[range[1]].number}` : 'Play the whole surah'}
                onPlayAll={() => playFrom(current >= 0 ? current : range ? range[0] : 0)}
                onStop={stop}
                onRestart={() => { stop(); setTimeout(() => playFrom(range ? range[0] : 0), 60); }}
              />
            </div>

            <BottomSheet open={showRepeat} onClose={() => setShowRepeat(false)} title="Repeat & loop" doneButton>
              <div className="space-y-5 pb-2">
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Play each ayah</p>
                  <SegmentedControl
                    options={REPEATS.map((n) => ({ value: String(n), label: `${n}×` }))}
                    value={String(times)}
                    onChange={(v) => setListenRepeat(Number(v), pauseMs)}
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-muted">Pause after each, to say it back</p>
                  <SegmentedControl
                    options={PAUSES.map((ms) => ({ value: String(ms), label: ms ? `${ms / 1000}s` : 'None' }))}
                    value={String(pauseMs)}
                    onChange={(v) => setListenRepeat(times, Number(v))}
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
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted">Changes apply the next time you press play.</p>
              </div>
            </BottomSheet>
          </>
        )}
      </main>
    </div>
  );
}
