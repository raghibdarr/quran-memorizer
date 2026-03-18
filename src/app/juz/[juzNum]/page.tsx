'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJuzIndex, getSurahIndex, getJuzSegmentsForSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { useProgressStore } from '@/stores/progress-store';
import type { JuzMeta, SurahMeta, LessonDef } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

interface SurahSection {
  surah: SurahMeta;
  ayahStart: number;
  ayahEnd: number;
  isPartial: boolean;
  lessons: LessonDef[];
}

export default function JuzDetailPage() {
  const params = useParams();
  const juzNum = parseInt(params.juzNum as string, 10);
  const [juz, setJuz] = useState<JuzMeta | null>(null);
  const [sections, setSections] = useState<SurahSection[]>([]);
  const progressLessons = useProgressStore((s) => s.lessons);

  useEffect(() => {
    Promise.all([getJuzIndex(), getSurahIndex()]).then(async ([juzIndex, surahIndex]) => {
      const juzData = juzIndex.find((j) => j.juzNumber === juzNum);
      if (!juzData) return;
      setJuz(juzData);

      const surahMap = new Map(surahIndex.map((s) => [s.id, s]));
      const sects: SurahSection[] = [];

      for (const mapping of juzData.verseMappings) {
        const surah = surahMap.get(mapping.surahId);
        if (!surah) continue;

        const juzSegs = await getJuzSegmentsForSurah(mapping.surahId);
        const allLessons = generateLessonsWithJuzBoundaries(mapping.surahId, surah.versesCount, juzSegs);
        const juzLessons = allLessons.filter((l) => l.juzNumber === juzNum);
        const isPartial = mapping.ayahStart !== 1 || mapping.ayahEnd !== surah.versesCount;

        sects.push({
          surah,
          ayahStart: mapping.ayahStart,
          ayahEnd: mapping.ayahEnd,
          isPartial,
          lessons: juzLessons,
        });
      }

      setSections(sects);
    });
  }, [juzNum]);

  if (!juz) return null;

  const allJuzLessons = sections.flatMap((s) => s.lessons);
  const completedCount = allJuzLessons.filter(
    (l) => progressLessons[l.lessonId]?.completedAt != null
  ).length;
  const overallProgress = allJuzLessons.length > 0 ? (completedCount / allJuzLessons.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="px-4 pt-6 pb-4 border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <a href="/" className="text-sm text-muted hover:text-foreground">← Back</a>
            <SettingsPanel />
          </div>
          <div className="mt-4 text-center">
            <h1 className="text-2xl font-bold text-teal">Juz {juzNum}</h1>
            <p className="text-sm text-muted">
              {sections.length} surah{sections.length !== 1 ? 's' : ''} · {allJuzLessons.length} lessons
            </p>
          </div>
          <div className="mt-3">
            <ProgressBar value={overallProgress} />
            <p className="mt-1 text-center text-xs text-muted">
              {completedCount} / {allJuzLessons.length} lessons completed
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <div className="space-y-6">
          {sections.map((section) => {
            const sectionCompleted = section.lessons.filter(
              (l) => progressLessons[l.lessonId]?.completedAt != null
            ).length;

            return (
              <div key={`${section.surah.id}-${section.ayahStart}`}>
                {/* Surah section header */}
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-foreground">
                      {section.surah.nameSimple}
                      {section.isPartial && (
                        <span className="ml-1.5 font-normal text-muted">
                          ({section.ayahStart}–{section.ayahEnd})
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-muted">
                      {section.lessons.length} lesson{section.lessons.length !== 1 ? 's' : ''}
                      {sectionCompleted > 0 && ` · ${sectionCompleted}/${section.lessons.length} done`}
                    </p>
                  </div>
                  <span className="arabic-text text-lg text-muted">{section.surah.nameArabic}</span>
                </div>

                {/* Lessons */}
                <div className="space-y-2">
                  {section.lessons.map((lesson) => {
                    const progress = progressLessons[lesson.lessonId];
                    const isComplete = progress?.completedAt != null;
                    const isActive = progress && !isComplete;
                    const phaseProgress = isActive
                      ? ['listen', 'understand', 'chunk', 'test', 'complete'].indexOf(progress.currentPhase) * 25
                      : isComplete ? 100 : 0;

                    return (
                      <a key={lesson.lessonId} href={`/lesson/${lesson.surahId}/${lesson.lessonNumber}`} className="block">
                        <Card
                          className={cn(
                            'flex items-center gap-4 transition-all hover:shadow-md',
                            isComplete && 'border border-success/20 bg-success/5'
                          )}
                        >
                          <div
                            className={cn(
                              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold',
                              isComplete ? 'bg-success text-white' :
                              isActive ? 'bg-teal text-white' :
                              'bg-foreground/10 text-muted'
                            )}
                          >
                            {isComplete ? <CheckIcon size={16} /> : lesson.lessonNumber}
                          </div>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground">
                              Lesson {lesson.lessonNumber}
                            </p>
                            <p className="text-xs text-muted">
                              Ayahs {lesson.ayahStart}–{lesson.ayahEnd}
                            </p>
                            {isActive && (
                              <div className="mt-1.5">
                                <ProgressBar value={phaseProgress} className="h-1" />
                                <p className="mt-0.5 text-[10px] capitalize text-teal">
                                  {progress.currentPhase} phase
                                </p>
                              </div>
                            )}
                          </div>
                        </Card>
                      </a>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
