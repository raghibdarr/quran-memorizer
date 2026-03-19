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
import PracticeSession from '@/components/practice/practice-session';
import Button from '@/components/ui/button';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';
import type { Ayah } from '@/types/quran';

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
  // Active practice session for juz-level (takes over the whole practice tab)
  const [activePractice, setActivePractice] = useState<{
    surahId: number | null; // null = multi-surah / entire juz
    ayahs: Ayah[];
    surahIds: number[];
    title: string;
    initialStep?: 'ayah-by-ayah' | 'full-passage';
  } | null>(null);
  // Lesson selection for practice
  const [selectedLessonIds, setSelectedLessonIds] = useState<Set<string>>(new Set());
  const [practiceMode, setPracticeMode] = useState<'lesson' | 'range'>('lesson');
  // Per-surah ranges for range mode
  const [surahRanges, setSurahRanges] = useState<Record<number, { start: number; end: number }>>({});

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
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-cream/95 px-4 py-3 backdrop-blur-sm border-b border-foreground/5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <a href="/" className="text-sm text-muted hover:text-foreground">&larr; Back</a>
          <SettingsPanel />
        </div>
      </div>

      <header className="px-4 pt-4 pb-4 border-b border-foreground/5">
        <div className="mx-auto max-w-2xl">
          <div className="text-center">
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
          /* Practice tab */
          activePractice ? (
            /* Active practice session — takes over the view */
            <div>
              <button
                onClick={() => setActivePractice(null)}
                className="mb-4 text-sm text-muted hover:text-foreground"
              >
                &larr; Back to selection
              </button>
              {activePractice.surahId != null && loadedSurahs[activePractice.surahId] ? (
                <PracticeContainer
                  surah={loadedSurahs[activePractice.surahId]}
                  lessons={sections.find((s) => s.surah.id === activePractice.surahId)?.lessons ?? []}
                  defaultAyahRange={(() => {
                    const sec = sections.find((s) => s.surah.id === activePractice.surahId);
                    return sec ? { start: sec.ayahStart, end: sec.ayahEnd } : undefined;
                  })()}
                />
              ) : activePractice.ayahs.length > 0 ? (
                <PracticeSession
                  surahIds={activePractice.surahIds}
                  title={activePractice.title}
                  ayahs={activePractice.ayahs}
                  lessonIds={[]}
                  initialStep={activePractice.initialStep ?? 'full-passage'}
                  surahNames={Object.fromEntries(sections.map((s) => [s.surah.id, s.surah.nameSimple]))}
                  onDone={() => setActivePractice(null)}
                />
              ) : null}
            </div>
          ) : (
            /* Practice selection */
            <div className="space-y-4">
              {practiceDataLoading ? (
                <Card className="text-center">
                  <p className="text-sm text-muted">Loading surah data...</p>
                </Card>
              ) : (
                <>
                  {/* By Lesson / By Range toggle */}
                  <div className="flex gap-1 rounded-xl bg-foreground/5 p-1">
                    <button
                      onClick={() => setPracticeMode('lesson')}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                        practiceMode === 'lesson' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
                      )}
                    >
                      By Lesson
                    </button>
                    <button
                      onClick={() => setPracticeMode('range')}
                      className={cn(
                        'flex-1 rounded-lg py-2 text-sm font-medium transition-colors',
                        practiceMode === 'range' ? 'bg-teal text-white' : 'text-muted hover:text-foreground'
                      )}
                    >
                      By Range
                    </button>
                  </div>

                  {practiceMode === 'lesson' ? (
                  <>
                  {/* Select all / deselect */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted">
                      {allJuzLessons.length} lesson{allJuzLessons.length !== 1 ? 's' : ''}
                    </p>
                    <button
                      onClick={() => {
                        if (selectedLessonIds.size === allJuzLessons.length) {
                          setSelectedLessonIds(new Set());
                        } else {
                          setSelectedLessonIds(new Set(allJuzLessons.map((l) => l.lessonId)));
                        }
                      }}
                      className="text-xs font-medium text-teal"
                    >
                      {selectedLessonIds.size === allJuzLessons.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {/* Lessons grouped by surah */}
                  {sections.map((section) => {
                    const sectionCompleted = section.lessons.filter(
                      (l) => progressLessons[l.lessonId]?.completedAt != null
                    ).length;
                    const allSectionSelected = section.lessons.every((l) => selectedLessonIds.has(l.lessonId));

                    return (
                      <div key={`practice-${section.surah.id}`}>
                        {/* Surah header with select-all for this surah */}
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
                              {sectionCompleted > 0 && ` · ${sectionCompleted} completed`}
                            </p>
                          </div>
                          <button
                            onClick={() => {
                              setSelectedLessonIds((prev) => {
                                const next = new Set(prev);
                                if (allSectionSelected) {
                                  section.lessons.forEach((l) => next.delete(l.lessonId));
                                } else {
                                  section.lessons.forEach((l) => next.add(l.lessonId));
                                }
                                return next;
                              });
                            }}
                            className="text-xs font-medium text-teal"
                          >
                            {allSectionSelected ? 'Deselect' : 'Select All'}
                          </button>
                        </div>

                        {/* Lesson checkboxes */}
                        <div className="space-y-1.5">
                          {section.lessons.map((lesson) => {
                            const isCompleted = progressLessons[lesson.lessonId]?.completedAt != null;
                            const isSelected = selectedLessonIds.has(lesson.lessonId);

                            return (
                              <button
                                key={lesson.lessonId}
                                onClick={() => {
                                  setSelectedLessonIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(lesson.lessonId)) next.delete(lesson.lessonId);
                                    else next.add(lesson.lessonId);
                                    return next;
                                  });
                                }}
                                className={cn(
                                  'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all',
                                  isSelected ? 'bg-teal/10 ring-2 ring-teal' : 'bg-card hover:bg-foreground/5'
                                )}
                              >
                                <div
                                  className={cn(
                                    'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold',
                                    isSelected ? 'bg-teal text-white' :
                                    isCompleted ? 'bg-success/20 text-success' :
                                    'bg-foreground/10 text-muted'
                                  )}
                                >
                                  {isSelected ? <CheckIcon size={12} /> : lesson.lessonNumber}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-foreground">Lesson {lesson.lessonNumber}</p>
                                  <p className="text-xs text-muted">
                                    Ayahs {lesson.ayahStart}&ndash;{lesson.ayahEnd}
                                    {isCompleted && <span className="ml-1 text-success">&#10003;</span>}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  </>
                  ) : (
                  /* By Range — per-surah range pickers */
                  <>
                  {sections.map((section) => {
                    const range = surahRanges[section.surah.id] ?? { start: section.ayahStart, end: section.ayahEnd };
                    return (
                      <Card key={`range-${section.surah.id}`}>
                        <div className="mb-3 flex items-center justify-between">
                          <h2 className="text-sm font-bold text-foreground">
                            {section.surah.nameSimple}
                            {section.isPartial && (
                              <span className="ml-1.5 font-normal text-muted">
                                ({section.ayahStart}&ndash;{section.ayahEnd})
                              </span>
                            )}
                          </h2>
                          <span className="arabic-text text-lg text-muted">{section.surah.nameArabic}</span>
                        </div>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-muted">Start</label>
                            <select
                              value={range.start}
                              onChange={(e) => {
                                const v = parseInt(e.target.value, 10);
                                setSurahRanges((prev) => ({
                                  ...prev,
                                  [section.surah.id]: { start: v, end: Math.max(v, range.end) },
                                }));
                              }}
                              className="w-full rounded-lg border border-foreground/10 bg-cream px-2 py-1.5 text-sm text-foreground"
                            >
                              {Array.from(
                                { length: section.ayahEnd - section.ayahStart + 1 },
                                (_, i) => section.ayahStart + i
                              ).map((n) => (
                                <option key={n} value={n}>Ayah {n}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex-1">
                            <label className="mb-1 block text-xs font-medium text-muted">End</label>
                            <select
                              value={range.end}
                              onChange={(e) => {
                                setSurahRanges((prev) => ({
                                  ...prev,
                                  [section.surah.id]: { ...range, end: parseInt(e.target.value, 10) },
                                }));
                              }}
                              className="w-full rounded-lg border border-foreground/10 bg-cream px-2 py-1.5 text-sm text-foreground"
                            >
                              {Array.from(
                                { length: section.ayahEnd - range.start + 1 },
                                (_, i) => range.start + i
                              ).map((n) => (
                                <option key={n} value={n}>Ayah {n}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                  </>
                  )}

                  {/* Spacer for sticky footer */}
                  <div className="h-28" />

                  {/* Sticky bottom bar */}
                  {(() => {
                    let selectedCount = 0;
                    let canStart = false;

                    if (practiceMode === 'lesson') {
                      selectedCount = allJuzLessons
                        .filter((l) => selectedLessonIds.has(l.lessonId))
                        .reduce((sum, l) => sum + l.ayahCount, 0);
                      canStart = selectedLessonIds.size > 0;
                    } else {
                      selectedCount = sections.reduce((sum, s) => {
                        const range = surahRanges[s.surah.id] ?? { start: s.ayahStart, end: s.ayahEnd };
                        return sum + (range.end - range.start + 1);
                      }, 0);
                      canStart = selectedCount > 0;
                    }

                    const startPractice = (mode: 'ayah-by-ayah' | 'full-passage') => {
                      const allAyahs: Ayah[] = [];
                      const surahIdList: number[] = [];

                      if (practiceMode === 'lesson') {
                        for (const section of sections) {
                          const surah = loadedSurahs[section.surah.id];
                          if (!surah) continue;
                          const sectionSelectedLessons = section.lessons
                            .filter((l) => selectedLessonIds.has(l.lessonId))
                            .sort((a, b) => a.ayahStart - b.ayahStart);
                          if (sectionSelectedLessons.length === 0) continue;
                          for (const lesson of sectionSelectedLessons) {
                            const lessonAyahs = surah.ayahs.filter(
                              (a) => a.number >= lesson.ayahStart && a.number <= lesson.ayahEnd
                            );
                            allAyahs.push(...lessonAyahs);
                          }
                          if (!surahIdList.includes(section.surah.id)) surahIdList.push(section.surah.id);
                        }
                      } else {
                        for (const section of sections) {
                          const surah = loadedSurahs[section.surah.id];
                          if (!surah) continue;
                          const range = surahRanges[section.surah.id] ?? { start: section.ayahStart, end: section.ayahEnd };
                          const rangeAyahs = surah.ayahs.filter(
                            (a) => a.number >= range.start && a.number <= range.end
                          );
                          allAyahs.push(...rangeAyahs);
                          if (rangeAyahs.length > 0 && !surahIdList.includes(section.surah.id)) {
                            surahIdList.push(section.surah.id);
                          }
                        }
                      }
                      if (allAyahs.length === 0) return;

                      const titleStr = surahIdList.length === 1
                        ? sections.find((s) => s.surah.id === surahIdList[0])?.surah.nameSimple ?? `Juz ${juzNum}`
                        : `Juz ${juzNum}`;

                      setActivePractice({
                        surahId: null,
                        ayahs: allAyahs,
                        surahIds: surahIdList,
                        title: titleStr,
                        initialStep: mode,
                      });
                    };

                    return (
                      <div className="fixed bottom-[3.25rem] left-0 right-0 z-20 border-t border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
                        <div className="mx-auto max-w-2xl space-y-2">
                          <p className="text-center text-sm font-medium text-foreground">
                            {selectedCount} ayah{selectedCount !== 1 ? 's' : ''} selected
                          </p>
                          <div className="flex gap-2">
                            <Button
                              onClick={() => startPractice('ayah-by-ayah')}
                              disabled={!canStart}
                              variant="secondary"
                              className="flex-1 text-sm"
                            >
                              Ayah by Ayah
                            </Button>
                            <Button
                              onClick={() => startPractice('full-passage')}
                              disabled={!canStart}
                              className="flex-1 text-sm"
                            >
                              All at Once
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          )
        )}
      </main>

      <BottomNav />
    </div>
  );
}
