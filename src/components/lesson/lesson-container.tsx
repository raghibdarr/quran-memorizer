'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Surah, Ayah, LessonDef, LessonPhase } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import PhaseIndicator from '@/components/ui/phase-indicator';
import SettingsPanel from '@/components/layout/settings-panel';
import BottomNav from '@/components/layout/bottom-nav';
import TajweedLegend from '@/components/ui/tajweed-legend';
import { RefreshIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import ListenPhase from './phases/listen-phase';
import UnderstandPhase from './phases/understand-phase';
import ChunkPhase from './phases/chunk-phase';
import TestPhase from './phases/test-phase';
import CompletePhase from './phases/complete-phase';

interface LessonContainerProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonDef: LessonDef;
  totalLessons: number;
}

const PHASE_ORDER: LessonPhase[] = ['listen', 'understand', 'chunk', 'test', 'complete'];

export default function LessonContainer({ surah, ayahs, lessonDef, totalLessons }: LessonContainerProps) {
  const { startLesson, updatePhase, resetLesson } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonDef.lessonId]);
  const [transitioning, setTransitioning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [chunkStartAtReview, setChunkStartAtReview] = useState(false);
  // Practice mode: overrides displayed phase without touching the store
  const [practicePhase, setPracticePhase] = useState<LessonPhase | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    startLesson(lessonDef.lessonId, surah.id);
  }, [lessonDef.lessonId, surah.id, startLesson]);

  // Track header height for sticky elements
  useEffect(() => {
    if (!headerRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--lesson-header-height',
        `${entry.contentRect.height + 24}px`
      );
    });
    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, []);

  if (!lesson) return null;

  const activePhase: LessonPhase = practicePhase ?? lesson.currentPhase;
  const currentPhaseIndex = PHASE_ORDER.indexOf(activePhase);
  const lessonTitle = totalLessons > 1
    ? `${surah.nameSimple} — Lesson ${lessonDef.lessonNumber}`
    : surah.nameSimple;

  const goToPhase = (phase: LessonPhase) => {
    setTransitioning(true);
    setTimeout(() => {
      if (practicePhase !== null) {
        // In practice mode — don't persist to store
        setPracticePhase(phase);
      } else {
        updatePhase(lessonDef.lessonId, phase);
      }
      setTransitioning(false);
    }, 300);
  };

  const goBack = () => {
    if (currentPhaseIndex > 0) {
      goToPhase(PHASE_ORDER[currentPhaseIndex - 1]);
    }
  };

  const handleReset = () => {
    resetLesson(lessonDef.lessonId, surah.id);
    setShowResetConfirm(false);
  };

  const backUrl = totalLessons > 1 ? `/lesson/${surah.id}` : '/';

  const phaseMap: Record<LessonPhase, React.ReactNode> = {
    listen: (
      <ListenPhase
        surah={surah}
        ayahs={ayahs}
        lessonId={lessonDef.lessonId}
        onComplete={() => goToPhase('understand')}
      />
    ),
    understand: (
      <UnderstandPhase
        surah={surah}
        ayahs={ayahs}
        lessonId={lessonDef.lessonId}
        onComplete={() => goToPhase('chunk')}
      />
    ),
    chunk: (
      <ChunkPhase
        surah={surah}
        ayahs={ayahs}
        lessonId={lessonDef.lessonId}
        startAtReview={chunkStartAtReview}
        onComplete={() => { setChunkStartAtReview(false); goToPhase('test'); }}
      />
    ),
    test: (
      <TestPhase
        surah={surah}
        ayahs={ayahs}
        lessonId={lessonDef.lessonId}
        totalLessons={totalLessons}
        onComplete={() => goToPhase('complete')}
        onRetry={() => { setChunkStartAtReview(true); goToPhase('chunk'); }}
      />
    ),
    complete: (
      <CompletePhase
        surah={surah}
        ayahs={ayahs}
        lessonDef={lessonDef}
        totalLessons={totalLessons}
        onPracticeAgain={() => {
          setChunkStartAtReview(true);
          setPracticePhase('chunk');
        }}
      />
    ),
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream pb-16">
      <header ref={headerRef} className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href={backUrl} className="text-sm text-muted hover:text-foreground">
                ← Back
              </a>
              {currentPhaseIndex > 0 && activePhase !== 'complete' && (
                <button onClick={goBack} className="text-xs text-muted hover:text-foreground">
                  ← Prev Phase
                </button>
              )}
            </div>
            <h2 className="text-sm font-semibold text-teal">{lessonTitle}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                title="Reset lesson"
              >
                <RefreshIcon size={14} />
              </button>
              <SettingsPanel />
            </div>
          </div>
          {totalLessons > 1 && (
            <p className="mb-2 text-center text-xs text-muted">
              Ayahs {lessonDef.ayahStart}–{lessonDef.ayahEnd}
            </p>
          )}
          <PhaseIndicator currentPhase={activePhase} />
          <TajweedLegend />
        </div>
      </header>

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">Reset Progress?</h3>
            <p className="mt-2 text-sm text-muted">
              This will restart this lesson from the Listen phase.
            </p>
            <div className="mt-4 flex gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl border border-foreground/10 py-2.5 text-sm font-medium text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-medium text-white"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      <main
        className={cn(
          'flex-1 px-4 py-6 transition-opacity duration-300',
          transitioning ? 'opacity-0' : 'opacity-100'
        )}
      >
        <div className="mx-auto max-w-2xl">
          {phaseMap[activePhase]}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
