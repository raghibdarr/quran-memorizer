'use client';


import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import type { Surah, Ayah, LessonDef, LessonPhase } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import { useStatsStore } from '@/stores/stats-store';
import PhaseIndicator from '@/components/ui/phase-indicator';
import SettingsPanel from '@/components/layout/settings-panel';
import UserButton from '@/components/auth/user-button';
import CloseButton from '@/components/ui/close-button';
import { useAppBack } from '@/hooks/use-app-back';
import ConfirmSheet from '@/components/ui/confirm-sheet';
import TajweedLegend from '@/components/ui/tajweed-legend';
import { RestartIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import ListenPhase from './phases/listen-phase';
import UnderstandPhase from './phases/understand-phase';
import ChunkPhase from './phases/chunk-phase';
import TestPhase from './phases/test-phase';
import CompletePhase from './phases/complete-phase';
import { lessonHref, safeFromPath } from '@/lib/routes';

interface LessonContainerProps {
  surah: Surah;
  ayahs: Ayah[];
  lessonDef: LessonDef;
  totalLessons: number;
}

export default function LessonContainer({ surah, ayahs, lessonDef, totalLessons }: LessonContainerProps) {
  const { startLesson, updatePhase, resetLesson } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[lessonDef.lessonId]);
  const [transitioning, setTransitioning] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  // Practice mode: overrides displayed phase without touching the store
  const [practicePhase, setPracticePhase] = useState<LessonPhase | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const { setLastActivity } = useStatsStore();
  const searchParams = useSearchParams();
  // Validated: it becomes a back link, and '/evil.com' would make '//evil.com'
  const fromParam = safeFromPath(searchParams.get('from'));

  useEffect(() => {
    startLesson(lessonDef.lessonId, surah.id);
    // Track last activity for home page continue card
    const label = totalLessons > 1
      ? `${surah.nameSimple} · Lesson ${lessonDef.lessonNumber}`
      : surah.nameSimple;
    setLastActivity({
      type: 'lesson',
      url: lessonHref(surah.id, lessonDef.lessonNumber, fromParam),
      label,
      timestamp: Date.now(),
    });
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

  const backUrl = fromParam ? `/${fromParam}` : `/lesson/${surah.id}`;
  const leave = useAppBack(backUrl);

  if (!lesson) return null;

  const activePhase: LessonPhase = practicePhase ?? lesson.currentPhase;
  const lessonTitle = totalLessons > 1
    ? `${surah.nameSimple} · Lesson ${lessonDef.lessonNumber}`
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

  const handleReset = () => {
    resetLesson(lessonDef.lessonId, surah.id);
    setShowResetConfirm(false);
  };


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
        onComplete={() => goToPhase('test')}
        onPause={leave}
      />
    ),
    test: (
      <TestPhase
        surah={surah}
        ayahs={ayahs}
        lessonId={lessonDef.lessonId}
        onComplete={() => goToPhase('complete')}
      />
    ),
    complete: (
      <CompletePhase
        surah={surah}
        ayahs={ayahs}
        lessonDef={lessonDef}
        totalLessons={totalLessons}
        onPracticeAgain={() => setPracticePhase('test')}
      />
    ),
  };

  return (
    <div
      className="flex min-h-dvh flex-col bg-cream"
      style={{ paddingBottom: 'var(--tabbar-clearance)' }}
    >
      <header ref={headerRef} className="sticky top-[var(--safe-top)] z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="mb-3 flex items-center justify-between">
            <CloseButton fallback={backUrl} label="Close lesson" />
            <h2 className="text-sm font-semibold text-teal">{lessonTitle}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowResetConfirm(true)}
                className="pressable flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-foreground/5 hover:text-foreground"
                title="Start lesson over"
                aria-label="Start lesson over"
              >
                <RestartIcon size={17} />
              </button>
              <SettingsPanel />
              <UserButton />
            </div>
          </div>
          {totalLessons > 1 && (
            <p className="mb-2 text-center text-xs text-muted">
              Ayahs {lessonDef.ayahStart}–{lessonDef.ayahEnd}
            </p>
          )}
          <PhaseIndicator currentPhase={activePhase} onPhaseClick={goToPhase} />
          <TajweedLegend />
        </div>
      </header>

      <ConfirmSheet
        open={showResetConfirm}
        title="Start this lesson over?"
        message="You'll go back to Listen, and this lesson won't count as done until you finish it again. Your reviews and streak aren't affected."
        confirmLabel="Start over"
        destructive
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />

      <main
        className={cn(
          'flex-1 overflow-x-clip px-4 py-6 transition-opacity duration-300',
          transitioning ? 'opacity-0' : 'opacity-100'
        )}
      >
        <div key={activePhase} className="mx-auto max-w-2xl animate-[phase-in_300ms_ease-out]">
          {phaseMap[activePhase]}
        </div>
      </main>

    </div>
  );
}
