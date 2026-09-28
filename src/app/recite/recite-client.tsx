'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { LessonDef, Surah } from '@/types/quran';
import { getSurah, getSurahLessons } from '@/lib/quran-data';
import { useAppBack } from '@/hooks/use-app-back';
import PracticeSession from '@/components/practice/practice-session';
import CloseButton from '@/components/ui/close-button';
import SettingsPanel from '@/components/layout/settings-panel';
import { SkeletonRows } from '@/components/ui/skeleton';
import VoiceRecite from '@/components/practice/voice-recite';
import { voiceCheckAvailable } from '@/lib/voice-tracker';

/**
 * Recite a whole surah from memory (persona tests: someone who already knows a
 * surah shouldn't have to pick "lessons" in a Review tab to do this). Text starts
 * hidden; peek or hear any ayah; rating is optional and, when given, feeds the
 * same strength data as reviews.
 */
export default function ReciteClient() {
  const params = useSearchParams();
  const surahId = Number(params.get('s'));
  const [data, setData] = useState<{ surah: Surah; lessons: LessonDef[] } | null>(null);
  const [voiceReady, setVoiceReady] = useState(false);
  const [voice, setVoice] = useState(false);
  const close = useAppBack(Number.isFinite(surahId) && surahId > 0 ? `/lesson/${surahId}` : '/');

  useEffect(() => {
    if (!Number.isFinite(surahId) || surahId < 1 || surahId > 114) return;
    let live = true;
    Promise.all([getSurah(surahId), getSurahLessons(surahId)]).then(([surah, lessons]) => {
      if (live) setData({ surah, lessons });
    });
    return () => { live = false; };
  }, [surahId]);

  // Voice check needs the on-device model, which only the app build ships
  useEffect(() => {
    voiceCheckAvailable().then(setVoiceReady);
  }, []);

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback={`/lesson/${surahId}`} label="Close recitation" />
          <span className="text-sm font-semibold text-teal">{data ? `Recite ${data.surah.nameSimple}` : 'Recite'}</span>
          <SettingsPanel />
        </div>
      </div>
      <main className="mx-auto max-w-2xl px-4 py-5">
        {data && voice ? (
          <VoiceRecite surahId={data.surah.id} ayahs={data.surah.ayahs} onExit={() => setVoice(false)} />
        ) : data ? (
          <>
          {voiceReady && (
            <button
              type="button"
              onClick={() => setVoice(true)}
              className="tactile-btn mb-4 flex w-full items-center justify-between rounded-2xl bg-gold/10 px-4 py-3 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-foreground">Check with your voice <span className="ml-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-deep">beta</span></span>
                <span className="block text-xs text-muted">Recite out loud and see which words come through</span>
              </span>
              <span aria-hidden className="text-gold-deep">›</span>
            </button>
          )}
          <PracticeSession
            surahIds={[data.surah.id]}
            title={data.surah.nameSimple}
            ayahs={data.surah.ayahs}
            lessonIds={data.lessons.map((l) => l.lessonId)}
            allLessonDefs={data.lessons}
            initialStep="full-passage"
            ratingOptional
            onDone={close}
          />
          </>
        ) : (
          <SkeletonRows count={5} />
        )}
      </main>
    </div>
  );
}
