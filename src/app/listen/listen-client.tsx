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
import { SkeletonRows } from '@/components/ui/skeleton';
import { cn } from '@/lib/cn';

const GAP_BETWEEN_AYAHS_MS = 300;

/**
 * Listen to a whole surah with the text following along (persona tests: there
 * was no plain read-and-listen mode — listening meant a grading screen whose
 * current ayah sat under the player). Tap any ayah to play from there.
 */
export default function ListenClient() {
  const params = useSearchParams();
  const surahId = Number(params.get('s'));
  const [surah, setSurah] = useState<Surah | null>(null);
  const [current, setCurrent] = useState(-1);
  const [playingAll, setPlayingAll] = useState(false);
  const abortRef = useRef(false);
  const ayahRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!Number.isFinite(surahId) || surahId < 1 || surahId > 114) return;
    let live = true;
    getSurah(surahId).then((s) => live && setSurah(s));
    return () => { live = false; };
  }, [surahId]);

  useEffect(() => () => { abortRef.current = true; audioController.stop(); }, []);

  // Keep the ayah being recited in view, clear of the header and the player
  useEffect(() => {
    if (current >= 0) ayahRefs.current[current]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [current]);

  const playFrom = useCallback(async (start: number) => {
    if (!surah) return;
    abortRef.current = false;
    setPlayingAll(true);
    for (let i = start; i < surah.ayahs.length; i++) {
      if (abortRef.current) break;
      setCurrent(i);
      await audioController.playAndWait(getAudioUrl(surah.id, surah.ayahs[i].number, useSettingsStore.getState().reciter));
      if (!abortRef.current && i < surah.ayahs.length - 1) await new Promise((r) => setTimeout(r, GAP_BETWEEN_AYAHS_MS));
    }
    if (!abortRef.current) setCurrent(-1);
    setPlayingAll(false);
  }, [surah]);

  const stop = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
  }, []);

  const playAyah = (i: number) => {
    stop();
    setTimeout(() => playFrom(i), 60);
  };

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback={`/lesson/${surahId}`} label="Close" />
          <span className="text-sm font-semibold text-teal">{surah ? `Listen · ${surah.nameSimple}` : 'Listen'}</span>
          <SettingsPanel />
        </div>
      </div>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {!surah ? (
          <SkeletonRows count={6} />
        ) : (
          <>
            <p className="mb-4 text-center text-sm text-muted">Tap any ayah to play from there.</p>
            <div className="space-y-3">
              {surah.ayahs.map((ayah, i) => (
                <div
                  key={ayah.key}
                  ref={(el) => { ayahRefs.current[i] = el; }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Play from ayah ${ayah.number}`}
                  aria-current={i === current ? 'true' : undefined}
                  onClick={() => playAyah(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playAyah(i); } }}
                  className={cn(
                    'cursor-pointer rounded-2xl border-[1.5px] p-4 transition-colors',
                    i === current ? 'border-teal/60 bg-teal/5' : 'border-transparent bg-card hover:border-foreground/10',
                  )}
                >
                  <p className="mb-1 text-xs text-muted">Ayah {ayah.number}</p>
                  <AyahDisplay ayah={ayah} />
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 z-10 -mx-4 mt-4 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'var(--tabbar-clearance)' }}>
              <MediaControlsBar
                className="static"
                playingAll={playingAll}
                currentIdx={current}
                total={surah.ayahs.length}
                idleLabel="Play the whole surah"
                onPlayAll={() => playFrom(current >= 0 ? current : 0)}
                onStop={stop}
                onRestart={() => { stop(); setTimeout(() => playFrom(0), 60); }}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
