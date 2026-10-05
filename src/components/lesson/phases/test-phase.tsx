'use client';

import { useCallback, useRef, useState } from 'react';
import type { Surah, Ayah } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useReviewStore } from '@/stores/review-store';
import { useSettingsStore } from '@/stores/settings-store';
import { useAudio } from '@/hooks/use-audio';
import AyahDisplay from '@/components/ui/ayah-display';
import Button from '@/components/ui/button';
import MediaControlsBar from '@/components/ui/media-controls-bar';
import { cn } from '@/lib/cn';
import { audioController } from '@/lib/audio';
import { getAudioUrl as buildAudioUrl } from '@/lib/quran-data';
import { haptic } from '@/lib/haptics';

import { PlayPill, HidePill } from '@/components/ui/ayah-actions';
interface TestPhaseProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonId: string;
  onComplete: () => void;
}

type Rating = 'got-it' | 'shaky' | 'missed';

const QUALITY: Record<Rating, number> = { 'got-it': 5, shaky: 3, missed: 1 };
const LABELS: Record<Rating, string> = { 'got-it': 'Got it', shaky: 'Shaky', missed: 'Missed' };
const TINTS: Record<Rating, string> = {
  'got-it': 'text-success bg-success/10',
  shaky: 'text-gold-deep bg-gold/10',
  missed: 'text-miss bg-miss/10',
};

/**
 * The Test (owner, 2026-09-28): ONE recital of the whole lesson from memory,
 * each ayah hidden until you check it, rated as you go. It replaces three levels
 * (multiple-choice blank, Arabic-only letter hints, full recall) that mostly
 * repeated Build's own final recital, and whose multiple choice leaned on
 * word-by-word transliteration that doesn't sound like connected recitation.
 * Build now ends after its last ayah; this recital is the lesson's real check,
 * and its ratings seed the ayahs' review schedule.
 */
export default function TestPhase({ surah, ayahs, lessonId, onComplete }: TestPhaseProps) {
  const markTestComplete = useProgressStore((s) => s.markTestComplete);
  const { reviewCard, addCard } = useReviewStore();
  const { isPlaying } = useAudio();

  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  // After "Recite again": the ayahs that were weak last time keep a marker
  const [flagged, setFlagged] = useState<Record<string, Rating>>({});
  const [playingAll, setPlayingAll] = useState(false);
  const [playingIdx, setPlayingIdx] = useState(-1);
  const abortRef = useRef(false);

  const first = ayahs[0].number;
  const last = ayahs[ayahs.length - 1].number;
  const isWholeSurah = ayahs.length === surah.versesCount;
  const ratedCount = Object.keys(ratings).length;
  const allRated = ratedCount === ayahs.length;
  const hasWeak = Object.values(ratings).some((r) => r !== 'got-it');

  const toggle = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const playAyah = async (ayah: Ayah, i: number) => {
    if (playingAll) return;
    setPlayingIdx(i);
    await audioController.playAndWait(buildAudioUrl(surah.id, ayah.number, useSettingsStore.getState().reciter));
    setPlayingIdx(-1);
  };

  const playAll = useCallback(async () => {
    if (playingAll) return;
    abortRef.current = false;
    setPlayingAll(true);
    for (let i = 0; i < ayahs.length; i++) {
      if (abortRef.current) break;
      setPlayingIdx(i);
      await audioController.playAndWait(buildAudioUrl(surah.id, ayahs[i].number, useSettingsStore.getState().reciter));
      if (!abortRef.current && i < ayahs.length - 1) await new Promise((r) => setTimeout(r, 400));
    }
    setPlayingIdx(-1);
    setPlayingAll(false);
  }, [ayahs, playingAll, surah.id]);

  const stop = useCallback(() => {
    abortRef.current = true;
    audioController.stop();
    setPlayingAll(false);
    setPlayingIdx(-1);
  }, []);

  const finish = (final: Record<string, Rating>) => {
    stop();
    for (const ayah of ayahs) {
      const r = final[ayah.key];
      if (!r) continue;
      addCard(surah.id, ayah.number); // no-op when it exists
      reviewCard(surah.id, ayah.number, QUALITY[r]);
    }
    markTestComplete(lessonId);
    haptic.success();
    onComplete();
  };

  // Every unrated ayah counts as "got it" (the one-tap path, and "the rest were fine")
  const finishRestGotIt = () => {
    const filled = { ...ratings };
    for (const a of ayahs) filled[a.key] ??= 'got-it';
    finish(filled);
  };

  const reciteAgain = () => {
    const weak: Record<string, Rating> = {};
    for (const [k, r] of Object.entries(ratings)) if (r !== 'got-it') weak[k] = r;
    setFlagged(weak);
    setRatings({});
    setRevealed(new Set());
    stop();
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-foreground">Recite the whole lesson</h3>
        <p className="mt-1 text-sm text-muted">
          {isWholeSurah ? `Recite ${surah.nameSimple} from memory` : `Recite ayahs ${first}–${last} from memory`}, then tap each
          ayah to check it.
        </p>
      </div>

      <button
        onClick={() => setRevealed(revealed.size === ayahs.length ? new Set() : new Set(ayahs.map((a) => a.key)))}
        className="pressable w-full rounded-xl bg-foreground/5 py-2.5 text-sm font-medium text-foreground hover:bg-foreground/10"
      >
        {revealed.size === ayahs.length ? 'Hide all' : 'Show all'}
      </button>

      <div className="space-y-3">
        {ayahs.map((ayah, i) => {
          const isRevealed = revealed.has(ayah.key);
          const rating = ratings[ayah.key];
          const flag = flagged[ayah.key];
          const isCurrent = playingIdx === i;
          const flagDot = flag && (
            <span className={cn('mr-1.5 inline-block h-2 w-2 rounded-full', flag === 'missed' ? 'bg-miss' : 'bg-gold')} />
          );
          return (
            <div
              key={ayah.key}
              className={cn(
                'rounded-xl p-4',
                isCurrent ? 'border border-teal/40 bg-teal/5' :
                isRevealed ? 'bg-card shadow-sm' :
                'border-2 border-dashed border-foreground/20',
              )}
            >
              {isRevealed ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      {flagDot}
                      Ayah {ayah.number}
                    </p>
                    <div className="flex items-center gap-2">
                      <PlayPill playing={isCurrent && isPlaying} onClick={() => playAyah(ayah, i)} />
                      <HidePill hidden={false} onClick={() => toggle(ayah.key)} />
                    </div>
                  </div>
                  <AyahDisplay ayah={ayah} />
                  <div className="flex gap-1.5 pt-1">
                    {(['got-it', 'shaky', 'missed'] as Rating[]).map((r) => (
                      <button
                        key={r}
                        onClick={() => setRatings((prev) => ({ ...prev, [ayah.key]: r }))}
                        className={cn(
                          'min-h-11 flex-1 rounded-lg text-xs font-semibold transition-colors',
                          rating === r ? TINTS[r] : 'bg-foreground/5 text-muted hover:bg-foreground/10',
                        )}
                      >
                        {LABELS[r]}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button onClick={() => toggle(ayah.key)} className="w-full py-2 text-center text-sm text-muted">
                  {flagDot}
                  Ayah {ayah.number} · tap to check
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Pinned footer: the player and the one action that matters now */}
      <div className="sticky bottom-0 z-10 -mx-4 space-y-2 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'var(--tabbar-clearance)' }}>
        {revealed.size > 0 && (
          <MediaControlsBar
            className="static"
            playingAll={playingAll}
            currentIdx={playingIdx}
            total={ayahs.length}
            idleLabel="Hear the whole lesson"
            onPlayAll={playAll}
            onStop={stop}
          />
        )}
        {allRated ? (
          <div className="flex gap-2">
            {hasWeak && (
              <Button onClick={reciteAgain} variant="secondary" className="flex-1">
                Recite again
              </Button>
            )}
            <Button onClick={() => finish(ratings)} className="flex-1">
              Finish lesson
            </Button>
          </div>
        ) : ratedCount === 0 ? (
          <Button onClick={finishRestGotIt} className="w-full">
            All good, I got every ayah
          </Button>
        ) : (
          <Button onClick={finishRestGotIt} variant="secondary" className="w-full">
            The rest were fine, finish
          </Button>
        )}
      </div>
    </div>
  );
}
