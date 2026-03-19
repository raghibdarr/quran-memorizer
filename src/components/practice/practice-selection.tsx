'use client';

import { useState, useMemo } from 'react';
import type { Surah, LessonDef, LessonProgress } from '@/types/quran';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type SelectionMode = 'lesson' | 'range';

interface PracticeSelectionProps {
  surah: Surah;
  lessons: LessonDef[];
  progressLessons: Record<string, LessonProgress>;
  defaultAyahRange?: { start: number; end: number };
  onStart: (ayahRange: { start: number; end: number }, lessonIds: string[]) => void;
}

export default function PracticeSelection({
  surah,
  lessons,
  progressLessons,
  defaultAyahRange,
  onStart,
}: PracticeSelectionProps) {
  const [mode, setMode] = useState<SelectionMode>('lesson');
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
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
    if (selectedLessonIds.size === completedLessons.length) {
      setSelectedLessonIds(new Set());
    } else {
      setSelectedLessonIds(new Set(completedLessons.map((l) => l.lessonId)));
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

  const handleStart = () => {
    if (mode === 'range') {
      onStart({ start: rangeStart, end: rangeEnd }, []);
    } else {
      const selected = lessons
        .filter((l) => selectedLessonIds.has(l.lessonId))
        .sort((a, b) => a.lessonNumber - b.lessonNumber);
      if (selected.length === 0) return;
      const start = selected[0].ayahStart;
      const end = selected[selected.length - 1].ayahEnd;
      onStart({ start, end }, selected.map((l) => l.lessonId));
    }
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
          {completedLessons.length === 0 ? (
            <Card className="text-center">
              <p className="text-sm text-muted">
                Complete at least one lesson to practice it here.
              </p>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted">
                  {completedLessons.length} completed lesson{completedLessons.length !== 1 ? 's' : ''}
                </p>
                <button onClick={selectAll} className="text-xs font-medium text-teal">
                  {selectedLessonIds.size === completedLessons.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              {lessons.map((lesson) => {
                const isCompleted = progressLessons[lesson.lessonId]?.completedAt != null;
                const isSelected = selectedLessonIds.has(lesson.lessonId);

                return (
                  <button
                    key={lesson.lessonId}
                    disabled={!isCompleted}
                    onClick={() => toggleLesson(lesson.lessonId)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                      isCompleted
                        ? isSelected
                          ? 'bg-teal/10 ring-2 ring-teal'
                          : 'bg-card hover:bg-foreground/5'
                        : 'cursor-not-allowed bg-foreground/3 opacity-50'
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
                      <p className="text-xs text-muted">Ayahs {lesson.ayahStart}–{lesson.ayahEnd}</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
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

      {/* Footer */}
      <div className="rounded-xl bg-foreground/5 p-3 text-center">
        <p className="text-sm font-medium text-foreground">{selectedAyahCount} ayah{selectedAyahCount !== 1 ? 's' : ''} selected</p>
      </div>

      <Button onClick={handleStart} disabled={!canStart} className="w-full">
        Start Practice
      </Button>
    </div>
  );
}
