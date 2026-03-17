'use client';

import { useEffect, useState } from 'react';
import type { Surah, LessonPhase } from '@/types/quran';
import { useProgressStore } from '@/stores/progress-store';
import PhaseIndicator from '@/components/ui/phase-indicator';
import SettingsPanel from '@/components/layout/settings-panel';
import ListenPhase from './phases/listen-phase';
import UnderstandPhase from './phases/understand-phase';
import ChunkPhase from './phases/chunk-phase';
import TestPhase from './phases/test-phase';
import CompletePhase from './phases/complete-phase';

interface LessonContainerProps {
  surah: Surah;
}

export default function LessonContainer({ surah }: LessonContainerProps) {
  const { startLesson, updatePhase, getLesson } = useProgressStore();
  const lesson = useProgressStore((s) => s.lessons[surah.id]);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    startLesson(surah.id);
  }, [surah.id, startLesson]);

  if (!lesson) return null;

  const goToPhase = (phase: LessonPhase) => {
    setTransitioning(true);
    setTimeout(() => {
      updatePhase(surah.id, phase);
      setTransitioning(false);
    }, 300);
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
    <div className="flex min-h-screen flex-col bg-cream">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-lg">
          <div className="mb-2 flex items-center justify-between">
            <a href="/" className="text-sm text-muted hover:text-foreground">
              ← Back
            </a>
            <h2 className="text-sm font-semibold text-teal">
              {surah.nameSimple}
            </h2>
            <SettingsPanel />
          </div>
          <PhaseIndicator currentPhase={lesson.currentPhase} />
        </div>
      </header>

      {/* Phase content */}
      <main
        className={`flex-1 px-4 py-6 transition-opacity duration-300 ${
          transitioning ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <div className="mx-auto max-w-lg">
          {phaseMap[lesson.currentPhase]}
        </div>
      </main>
    </div>
  );
}
