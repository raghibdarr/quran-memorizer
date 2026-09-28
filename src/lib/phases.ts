import type { LessonPhase } from '@/types/quran';

// The lesson's visible steps (owner, 2026-09-28): Understand merged into Listen,
// Build renamed Memorize. 'understand' stays a valid stored phase (older saves,
// sync) and simply shows as Listen.

export const LESSON_STEPS: LessonPhase[] = ['listen', 'chunk', 'test', 'complete'];

/** User-facing names — stored keys ('chunk' …) never reach the screen */
export const PHASE_LABELS: Record<LessonPhase, string> = {
  listen: 'Listen',
  understand: 'Listen',
  chunk: 'Memorize',
  test: 'Test',
  complete: 'Done',
};

export const visiblePhase = (phase: LessonPhase): LessonPhase => (phase === 'understand' ? 'listen' : phase);

/** 0–100 through the lesson's steps */
export const phaseProgressPct = (phase: LessonPhase): number =>
  (Math.max(0, LESSON_STEPS.indexOf(visiblePhase(phase))) / (LESSON_STEPS.length - 1)) * 100;
