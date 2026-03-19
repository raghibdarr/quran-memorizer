'use client';

import { useState, useMemo } from 'react';
import type { Surah, LessonDef, LessonProgress } from '@/types/quran';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type SelectionMode = 'lesson' | 'range';
export type PracticeFlowMode = 'ayah-by-ayah' | 'full-passage';

interface PracticeSelectionProps {
  surah: Surah;
  lessons: LessonDef[];
  progressLessons: Record<string, LessonProgress>;
  defaultAyahRange?: { start: number; end: number };
  preSelectedLesson?: number;  // lesson number to pre-select (from review page)
  onStart: (ayahRange: { start: number; end: number }, lessonIds: string[], flowMode: PracticeFlowMode) => void;
}

export default function PracticeSelection({
  surah,
  lessons,
  progressLessons,
  defaultAyahRange,
  preSelectedLesson,
  onStart,
}: PracticeSelectionProps) {
  const [mode, setMode] = useState<SelectionMode>('lesson');
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(() => {
    if (preSelectedLesson) {
      const lesson = lessons.find((l) => l.lessonNumber === preSelectedLesson);
      if (lesson) return new Set([lesson.lessonId]);
    }
    return new Set();
  });
  const [rangeStart, setRangeStart] = useState(defaultAyahRange?.start ?? 1);
  const [rangeEnd, setRangeEnd] = useState(defaultAyahRange?.end ?? surah.versesCount);

  const completedLessons = useMemo(
    () => lessons.filter((l) => progressLessons[l.lessonId]?.completedAt != null),
    [lessons, progressLessons]
  );

  const toggleLesson = (lessonId: string) => {
    setSelectedLessonIds((prev) => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedLessonIds.size === lessons.length) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(lessons.map((l) => l.lessonId)));
    }
  };

  const selectedAyahCount = useMemo(() => {
    if (mode === 'range') {
      return Math.max(0, rangeEnd - rangeStart + 1);
    }
    return lessons
      .filter((l) => selectedLessonIds.has(l.lessonId))
      .reduce((sum, l) => sum + l.ayahCount, 0);
  }, [mode, rangeStart, rangeEnd, lessons, selectedLessonIds]);

  const getAyahRange = () => {
    if (mode === 'range') {
      return { start: rangeStart, end: rangeEnd, lessonIds: [] as string[] };
    }
    const selected = lessons
      .filter((l) => selectedLessonIds.has(l.lessonId))
      .sort((a, b) => a.lessonNumber - b.lessonNumber);
    if (selected.length === 0) return null;
    return {
      start: selected[0].ayahStart,
      end: selected[selected.length - 1].ayahEnd,
      lessonIds: selected.map((l) => l.lessonId),
    };
  };

  const canStart = mode === 'range' ? rangeEnd >= rangeStart : selectedLessonIds.size > 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-1 rounded-xl bg-foreground/5 p-1">
        <button
          onClick={() => setMode('lesson')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            mode === 'lesson' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
          )}
        >
          By Lesson
        </button>
        <button
          onClick={() => setMode('range')}
          className={cn(
            'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
            mode === 'range' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
          )}
        >
          By Range
        </button>
      </div>

      {mode === 'lesson' ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              {lessons.length} lesson{lessons.length !== 1 ? 's' : ''}
              {completedLessons.length > 0 && ` · ${completedLessons.length} completed`}
            </p>
            <button onClick={selectAll} className="text-xs font-medium text-teal">
              {selectedLessonIds.size === lessons.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {lessons.map((lesson) => {
            const isCompleted = progressLessons[lesson.lessonId]?.completedAt != null;
            const isSelected = selectedLessonIds.has(lesson.lessonId);

            return (
              <button
                key={lesson.lessonId}
                onClick={() => toggleLesson(lesson.lessonId)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                  isSelected
                    ? 'bg-teal/10 ring-2 ring-teal'
                    : 'bg-card hover:bg-foreground/5'
                )}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    isSelected ? 'bg-teal text-white' :
                    isCompleted ? 'bg-success/20 text-success' :
                    'bg-foreground/10 text-muted'
                  )}
                >
                  {isSelected ? <CheckIcon size={14} /> : lesson.lessonNumber}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Lesson {lesson.lessonNumber}</p>
                  <p className="text-xs text-muted">
                    Ayahs {lesson.ayahStart}–{lesson.ayahEnd}
                    {isCompleted && <span className="ml-1 text-success">✓</span>}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Start Ayah</label>
              <select
                value={rangeStart}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  setRangeStart(v);
                  if (v > rangeEnd) setRangeEnd(v);
                }}
                className="w-full rounded-lg border border-foreground/10 bg-cream px-3 py-2 text-sm text-foreground"
              >
                {Array.from({ length: surah.versesCount }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>Ayah {n}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">End Ayah</label>
              <select
                value={rangeEnd}
                onChange={(e) => setRangeEnd(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-foreground/10 bg-cream px-3 py-2 text-sm text-foreground"
              >
                {Array.from({ length: surah.versesCount - rangeStart + 1 }, (_, i) => rangeStart + i).map((n) => (
                  <option key={n} value={n}>Ayah {n}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>
      )}

      {/* Spacer for sticky footer */}
      <div className="h-28" />

      {/* Sticky bottom bar */}
      <div className="fixed bottom-[3.25rem] left-0 right-0 z-20 border-t border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl space-y-2">
          <p className="text-center text-sm font-medium text-foreground">
            {selectedAyahCount} ayah{selectedAyahCount !== 1 ? 's' : ''} selected
          </p>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                const range = getAyahRange();
                if (range) onStart({ start: range.start, end: range.end }, range.lessonIds, 'ayah-by-ayah');
              }}
              disabled={!canStart}
              variant="secondary"
              className="flex-1 text-sm"
            >
              Ayah by Ayah
            </Button>
            <Button
              onClick={() => {
                const range = getAyahRange();
                if (range) onStart({ start: range.start, end: range.end }, range.lessonIds, 'full-passage');
              }}
              disabled={!canStart}
              className="flex-1 text-sm"
            >
              All at Once
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
