'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { getJuzIndex, getSurahIndex, getSurah, getJuzSegmentsForSurah } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import { useProgressStore } from '@/stores/progress-store';
import type { JuzMeta, SurahMeta, Surah, LessonDef } from '@/types/quran';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import SettingsPanel from '@/components/layout/settings-panel';
import PracticeContainer from '@/components/practice/practice-container';
import JuzPracticeContainer from '@/components/practice/juz-practice-container';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type Tab = 'learn' | 'practice';

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
  const [activeTab, setActiveTab] = useState<Tab>('learn');
  const [loadedSurahs, setLoadedSurahs] = useState<Record<number, Surah>>({});
  const [practiceDataLoading, setPracticeDataLoading] = useState(false);

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

  // Eagerly load all surah data when practice tab is activated
  useEffect(() => {
    if (activeTab !== 'practice' || sections.length === 0) return;
    // Check if all are already loaded
    const allLoaded = sections.every((s) => loadedSurahs[s.surah.id]);
    if (allLoaded) return;

    setPracticeDataLoading(true);
    Promise.all(
      sections.map(async (s) => {
        if (loadedSurahs[s.surah.id]) return;
        try {
          const surah = await getSurah(s.surah.id);
          setLoadedSurahs((prev) => ({ ...prev, [s.surah.id]: surah }));
        } catch {
          // Skip unavailable surahs
        }
      })
    ).then(() => setPracticeDataLoading(false));
  }, [activeTab, sections, loadedSurahs]);

  if (!juz) return null;

  const allJuzLessons = sections.flatMap((s) => s.lessons);
  const completedCount = allJuzLessons.filter(
    (l) => progressLessons[l.lessonId]?.completedAt != null
  ).length;
  const overallProgress = allJuzLessons.length > 0 ? (completedCount / allJuzLessons.length) * 100 : 0;

  // Build loaded sections for JuzPracticeContainer
  const loadedSections = sections
    .filter((s) => loadedSurahs[s.surah.id])
    .map((s) => ({
      surah: loadedSurahs[s.surah.id],
      ayahStart: s.ayahStart,
      ayahEnd: s.ayahEnd,
      lessons: s.lessons,
    }));
  const allSurahsLoaded = loadedSections.length === sections.length;

  return (
    <div className="min-h-screen bg-cream pb-20">
      <header className="px-4 pt-6 pb-4 border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <a href="/" className="text-sm text-muted hover:text-foreground">&larr; Back</a>
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

          {/* Learn / Practice tab toggle */}
          <div className="mt-4 flex gap-1 rounded-xl bg-foreground/5 p-1">
            <button
              onClick={() => setActiveTab('learn')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                activeTab === 'learn' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
              )}
            >
              Learn
            </button>
            <button
              onClick={() => setActiveTab('practice')}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                activeTab === 'practice' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
              )}
            >
              Practice
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        {activeTab === 'learn' ? (
          <div className="space-y-6">
            {sections.map((section) => {
              const sectionCompleted = section.lessons.filter(
                (l) => progressLessons[l.lessonId]?.completedAt != null
              ).length;

              return (
                <div key={`${section.surah.id}-${section.ayahStart}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        {section.surah.nameSimple}
                        {section.isPartial && (
                          <span className="ml-1.5 font-normal text-muted">
                            ({section.ayahStart}&ndash;{section.ayahEnd})
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
                                Ayahs {lesson.ayahStart}&ndash;{lesson.ayahEnd}
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
        ) : (
          /* Practice tab — whole-juz button + expanded per-surah sections */
          <div className="space-y-6">
            {/* Practice Entire Juz */}
            {practiceDataLoading ? (
              <Card className="text-center">
                <p className="text-sm text-muted">Loading surah data...</p>
              </Card>
            ) : allSurahsLoaded ? (
              <JuzPracticeContainer juzNum={juzNum} sections={loadedSections} />
            ) : null}

            {/* Per-surah practice sections (all expanded) */}
            {sections.map((section) => {
              const loadedSurah = loadedSurahs[section.surah.id];
              const sectionCompleted = section.lessons.filter(
                (l) => progressLessons[l.lessonId]?.completedAt != null
              ).length;

              return (
                <div key={`practice-${section.surah.id}`}>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h2 className="text-sm font-bold text-foreground">
                        {section.surah.nameSimple}
                        {section.isPartial && (
                          <span className="ml-1.5 font-normal text-muted">
                            ({section.ayahStart}&ndash;{section.ayahEnd})
                          </span>
                        )}
                      </h2>
                      <p className="text-xs text-muted">
                        {sectionCompleted}/{section.lessons.length} lessons completed
                      </p>
                    </div>
                    <span className="arabic-text text-lg text-muted">{section.surah.nameArabic}</span>
                  </div>

                  {loadedSurah ? (
                    <PracticeContainer
                      surah={loadedSurah}
                      lessons={section.lessons}
                      defaultAyahRange={{ start: section.ayahStart, end: section.ayahEnd }}
                    />
                  ) : (
                    <Card className="text-center">
                      <p className="text-sm text-muted">Loading...</p>
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
