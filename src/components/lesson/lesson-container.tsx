'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import type { Surah, LessonPhase } from '@/types/quran';
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
}

const PHASE_ORDER: LessonPhase[] = ['listen', 'understand', 'chunk', 'test', 'complete'];

export default function LessonContainer({ surah }: LessonContainerProps) {
  const { startLesson, updatePhase, resetLesson } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);
  const [transitioning, setTransitioning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Track header height and expose as CSS variable
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

  useEffect(() => {
    startLesson(surah.id);
  }, [surah.id, startLesson]);

  if (!lesson) return null;

  const currentPhaseIndex = PHASE_ORDER.indexOf(lesson.currentPhase);

  const goToPhase = (phase: LessonPhase) => {
    setTransitioning(true);
    setTimeout(() => {
      updatePhase(surah.id, phase);
      setTransitioning(false);
    }, 300);
  };

  const goBack = () => {
    if (currentPhaseIndex > 0) {
      goToPhase(PHASE_ORDER[currentPhaseIndex - 1]);
    }
  };

  const handleReset = () => {
    resetLesson(surah.id);
    setShowResetConfirm(false);
  };

  const phaseMap: Record<LessonPhase, React.ReactNode> = {
    listen: (
      <ListenPhase
        surah={surah}
        onComplete={() => goToPhase('understand')}
      />
    ),
    understand: (
      <UnderstandPhase
        surah={surah}
        onComplete={() => goToPhase('chunk')}
      />
    ),
    chunk: (
      <ChunkPhase
        surah={surah}
        onComplete={() => goToPhase('test')}
      />
    ),
    test: (
      <TestPhase
        surah={surah}
        onComplete={() => goToPhase('complete')}
        onRetry={() => goToPhase('chunk')}
      />
    ),
    complete: <CompletePhase surah={surah} />,
  };

  return (
    <div className="flex min-h-screen flex-col bg-cream pb-16">
      {/* Header */}
      <header ref={headerRef} className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <a href="/" className="text-sm text-muted hover:text-foreground">
                ← Back
              </a>
              {currentPhaseIndex > 0 && lesson.currentPhase !== 'complete' && (
                <button
                  onClick={goBack}
                  className="text-xs text-muted hover:text-foreground"
                >
                  ← Prev Phase
                </button>
              )}
            </div>
            <h2 className="text-sm font-semibold text-teal">
              {surah.nameSimple}
            </h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-foreground/5 hover:text-foreground"
                aria-label="Reset lesson"
                title="Reset lesson"
              >
                <RefreshIcon size={14} />
              </button>
              <SettingsPanel />
            </div>
          </div>
          <PhaseIndicator currentPhase={lesson.currentPhase} />
          <TajweedLegend />
        </div>
      </header>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">Reset Progress?</h3>
            <p className="mt-2 text-sm text-muted">
              This will restart {surah.nameSimple} from the Listen phase. Your review cards won't be affected.
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

      {/* Phase content */}
      <main
        className={cn(
          'flex-1 px-4 py-6 transition-opacity duration-300',
          transitioning ? 'opacity-0' : 'opacity-100'
        )}
      >
        <div className="mx-auto max-w-2xl">
          {phaseMap[lesson.currentPhase]}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
