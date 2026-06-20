'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JuzMeta, PlanGoalType, SurahMeta } from '@/types/quran';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import {
  generateLessonsWithJuzBoundaries,
} from '@/lib/curriculum';
import { countStudyDays, resolveGoalSurahIds, suggestedPace, todayIso } from '@/lib/plan';
import { usePlanStore } from '@/stores/plan-store';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type Step = 1 | 2;

export default function PlanEditPage() {
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const updateGoalScope = usePlanStore((s) => s.updateGoalScope);

  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);

  const [step, setStep] = useState<Step>(1);
  const [goalType, setGoalType] = useState<PlanGoalType>('juz');
  const [selectedSurahIds, setSelectedSurahIds] = useState<number[]>([]);
  const [selectedJuzNumbers, setSelectedJuzNumbers] = useState<number[]>([]);
  const [knownSurahIds, setKnownSurahIds] = useState<number[]>([]);
  const [knownLessonIds, setKnownLessonIds] = useState<string[]>([]);
  const [surahSearch, setSurahSearch] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [expandedSurah, setExpandedSurah] = useState<number | null>(null);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  // Seed state from the existing plan
  useEffect(() => {
    if (!plan) return;
    setGoalType(plan.goalType);
    setSelectedSurahIds(plan.goalType === 'surah' ? plan.goalSurahIds : []);
    setSelectedJuzNumbers(plan.goalType === 'juz' ? plan.goalJuzNumbers : []);
    setKnownSurahIds(plan.knownSurahIds);
    setKnownLessonIds(plan.knownLessonIds ?? []);
  }, [plan]);

  const goalSurahIds = useMemo(() => {
    if (!juzIndex.length) return [];
    return resolveGoalSurahIds(
      goalType,
      { surahIds: selectedSurahIds, juzNumbers: selectedJuzNumbers },
      juzIndex,
    );
  }, [goalType, selectedSurahIds, selectedJuzNumbers, juzIndex]);

  const goalSurahs = useMemo(() => {
    const byId = new Map(allSurahs.map((s) => [s.id, s]));
    return goalSurahIds.map((id) => byId.get(id)).filter(Boolean) as SurahMeta[];
  }, [goalSurahIds, allSurahs]);

  // Projected total lessons under the new scope (for feasibility warnings)
  const newTotalLessons = useMemo(() => {
    if (!goalSurahs.length || !juzIndex.length) return 0;
    const known = new Set(knownSurahIds);
    const knownLessons = new Set(knownLessonIds);
    const juzFilter = goalType === 'juz' ? new Set(selectedJuzNumbers) : null;
    let count = 0;
    for (const surah of goalSurahs) {
      if (known.has(surah.id)) continue;
      const segs: Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }> = [];
      for (const juz of juzIndex) {
        for (const m of juz.verseMappings) {
          if (m.surahId === surah.id) {
            segs.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
          }
        }
      }
      let lessons = generateLessonsWithJuzBoundaries(surah.id, surah.versesCount, segs);
      if (juzFilter) lessons = lessons.filter((l) => juzFilter.has(l.juzNumber));
      if (knownLessons.size) lessons = lessons.filter((l) => !knownLessons.has(l.lessonId));
      count += lessons.length;
    }
    return count;
  }, [goalSurahs, juzIndex, goalType, selectedJuzNumbers, knownSurahIds, knownLessonIds]);

  // Feasibility check: only meaningful when a deadline is set
  const feasibility = useMemo(() => {
    if (!plan?.deadline) return null;
    if (newTotalLessons <= 0) return null;
    const today = todayIso();
    if (plan.deadline <= today) return null;
    const studyDaysLeft = countStudyDays(today, plan.deadline, plan.studyDays);
    if (studyDaysLeft <= 0) return null;
    const required = Math.ceil(newTotalLessons / studyDaysLeft);
    const suggestion = suggestedPace(newTotalLessons, plan.deadline, plan.studyDays);
    return {
      required,
      impossible: required > 20,
      intensive: required > 5 && required <= 20,
      exceedsCurrentPace: required > plan.lessonsPerDay,
      suggestion,
    };
  }, [plan, newTotalLessons]);

  const visibleSurahs = useMemo(() => {
    const q = surahSearch.trim().toLowerCase();
    if (!q) return allSurahs;
    return allSurahs.filter(
      (s) =>
        s.nameSimple.toLowerCase().includes(q) ||
        s.nameTranslation.toLowerCase().includes(q) ||
        String(s.id) === q,
    );
  }, [allSurahs, surahSearch]);

  const toggleSurah = (id: number) =>
    setSelectedSurahIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleJuz = (n: number) =>
    setSelectedJuzNumbers((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n],
    );
  const toggleKnown = (id: number) =>
    setKnownSurahIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleKnownLesson = (lessonId: string) =>
    setKnownLessonIds((prev) =>
      prev.includes(lessonId) ? prev.filter((x) => x !== lessonId) : [...prev, lessonId],
    );

  const skipPreAssessment = goalType === 'surah';
  const totalSteps = skipPreAssessment ? 1 : 2;
  const visibleStep = step;

  const canAdvance =
    goalType === 'full-quran' ||
    (goalType === 'juz' && selectedJuzNumbers.length > 0) ||
    (goalType === 'surah' && selectedSurahIds.length > 0);

  const handleSave = () => {
    updateGoalScope({
      goalType,
      goalSurahIds,
      goalJuzNumbers: goalType === 'juz' ? selectedJuzNumbers : [],
      knownSurahIds: knownSurahIds.filter((id) => goalSurahIds.includes(id)),
      knownLessonIds: knownLessonIds.filter((lid) => {
        const surahId = parseInt(lid.split('-')[0], 10);
        return goalSurahIds.includes(surahId);
      }),
    });
    router.push('/plan');
  };

  // Juz-segments helper for lesson enumeration per-surah (for partial pre-assessment)
  const juzSegsFor = (surahId: number) => {
    const segs: Array<{ juzNumber: number; ayahStart: number; ayahEnd: number }> = [];
    for (const juz of juzIndex) {
      for (const m of juz.verseMappings) {
        if (m.surahId === surahId) {
          segs.push({ juzNumber: juz.juzNumber, ayahStart: m.ayahStart, ayahEnd: m.ayahEnd });
        }
      }
    }
    return segs.sort((a, b) => a.ayahStart - b.ayahStart);
  };

  if (!plan) {
    return (
      <div className="min-h-screen bg-cream p-6">
        <p className="text-center text-sm text-muted">No plan to edit.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Edit plan {totalSteps > 1 ? `· Step ${visibleStep} of ${totalSteps}` : ''}
          </p>
          <h1 className="text-xl font-bold text-teal">
            {step === 1 ? "Change what you're memorizing" : 'Update what you already know'}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {step === 1 && (
          <>
            <div className="grid grid-cols-3 gap-3">
              {(['surah', 'juz', 'full-quran'] as PlanGoalType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => setGoalType(type)}
                  className={cn(
                    'rounded-2xl border-2 bg-card p-4 text-center transition-all',
                    goalType === type
                      ? 'border-teal shadow-sm'
                      : 'border-transparent hover:border-foreground/10',
                  )}
                >
                  <p className="text-sm font-bold text-foreground">
                    {type === 'surah' ? 'Surahs' : type === 'juz' ? 'Juz' : 'Full Quran'}
                  </p>
                </button>
              ))}
            </div>

            {goalType === 'surah' && (
              <Card>
                <input
                  type="text"
                  value={surahSearch}
                  onChange={(e) => setSurahSearch(e.target.value)}
                  placeholder="Search surahs..."
                  className="w-full rounded-xl border border-foreground/10 bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted/60 focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                />
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted">Range</span>
                  <input
                    type="number"
                    min={1}
                    max={114}
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value)}
                    placeholder="from"
                    className="w-16 rounded-lg border border-foreground/10 bg-card px-2 py-1 text-xs text-foreground"
                  />
                  <span className="text-xs text-muted">–</span>
                  <input
                    type="number"
                    min={1}
                    max={114}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    placeholder="to"
                    className="w-16 rounded-lg border border-foreground/10 bg-card px-2 py-1 text-xs text-foreground"
                  />
                  <button
                    onClick={() => {
                      const from = Math.max(1, Math.min(114, parseInt(rangeFrom, 10) || 0));
                      const to = Math.max(1, Math.min(114, parseInt(rangeTo, 10) || 0));
                      if (!from || !to) return;
                      const [lo, hi] = from <= to ? [from, to] : [to, from];
                      const ids: number[] = [];
                      for (let i = lo; i <= hi; i++) ids.push(i);
                      setSelectedSurahIds((prev) => Array.from(new Set([...prev, ...ids])));
                      setRangeFrom('');
                      setRangeTo('');
                    }}
                    disabled={!rangeFrom || !rangeTo}
                    className="rounded-lg bg-teal px-3 py-1 text-xs font-semibold text-on-teal disabled:opacity-40"
                  >
                    Add
                  </button>
                  {selectedSurahIds.length > 0 && (
                    <button
                      onClick={() => setSelectedSurahIds([])}
                      className="ml-auto text-[11px] font-medium text-muted hover:text-foreground"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted">{selectedSurahIds.length} selected</p>
                <div className="mt-3 max-h-[50vh] space-y-1 overflow-y-auto">
                  {visibleSurahs.map((s) => {
                    const selected = selectedSurahIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggleSurah(s.id)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                          selected ? 'bg-teal/10' : 'hover:bg-foreground/5',
                        )}
                      >
                        <span className="w-6 text-right text-xs font-medium text-muted">{s.id}</span>
                        <span className="arabic-text text-base leading-none">{s.nameArabic}</span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{s.nameSimple}</span>
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border-2',
                            selected ? 'border-teal bg-teal text-on-teal' : 'border-foreground/20',
                          )}
                        >
                          {selected && <CheckIcon size={12} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {goalType === 'juz' && (
              <Card>
                <p className="text-xs text-muted">{selectedJuzNumbers.length} juz selected</p>
                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
                    const selected = selectedJuzNumbers.includes(n);
                    return (
                      <button
                        key={n}
                        onClick={() => toggleJuz(n)}
                        className={cn(
                          'rounded-xl border-2 py-2 text-sm font-semibold transition-colors',
                          selected
                            ? 'border-teal bg-teal text-on-teal'
                            : 'border-foreground/10 text-foreground hover:border-teal/30',
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              </Card>
            )}

            {goalType === 'full-quran' && (
              <Card>
                <p className="text-sm text-foreground">All 114 surahs, ordered shortest-first.</p>
              </Card>
            )}
          </>
        )}

        {step === 2 && (
          <Card>
            <p className="text-sm text-muted">
              Tick surahs you&apos;ve memorized. Tap a surah to tick individual lessons.
            </p>
            <p className="mt-1 text-xs text-muted/70">
              {knownSurahIds.length} surah{knownSurahIds.length === 1 ? '' : 's'}, {knownLessonIds.length} lesson{knownLessonIds.length === 1 ? '' : 's'} marked as known
            </p>
            <div className="mt-3 max-h-[55vh] space-y-1 overflow-y-auto">
              {goalSurahs.map((s) => {
                const known = knownSurahIds.includes(s.id);
                const expanded = expandedSurah === s.id;
                const segs = juzSegsFor(s.id);
                const lessons = generateLessonsWithJuzBoundaries(s.id, s.versesCount, segs);
                const juzFilter = goalType === 'juz' ? new Set(selectedJuzNumbers) : null;
                const scopedLessons = juzFilter ? lessons.filter((l) => juzFilter.has(l.juzNumber)) : lessons;
                const knownCount = scopedLessons.filter((l) => knownLessonIds.includes(l.lessonId)).length;

                return (
                  <div key={s.id} className="rounded-lg">
                    <div
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors',
                        known ? 'bg-success/10' : 'hover:bg-foreground/5',
                      )}
                    >
                      <button
                        onClick={() => toggleKnown(s.id)}
                        className="flex flex-1 items-center gap-3 text-left"
                      >
                        <span className="w-6 text-right text-xs font-medium text-muted">{s.id}</span>
                        <span className="arabic-text text-base leading-none">{s.nameArabic}</span>
                        <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{s.nameSimple}</span>
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border-2',
                            known ? 'border-success bg-success text-on-success' : 'border-foreground/20',
                          )}
                        >
                          {known && <CheckIcon size={12} />}
                        </span>
                      </button>
                      {scopedLessons.length > 1 && !known && (
                        <button
                          onClick={() => setExpandedSurah(expanded ? null : s.id)}
                          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-muted hover:text-foreground"
                        >
                          {expanded ? 'Hide' : knownCount > 0 ? `${knownCount}/${scopedLessons.length}` : 'Lessons'}
                        </button>
                      )}
                    </div>
                    {expanded && !known && (
                      <div className="mt-1 ml-10 space-y-1 border-l-2 border-foreground/10 pl-3">
                        {scopedLessons.map((l) => {
                          const lessonKnown = knownLessonIds.includes(l.lessonId);
                          return (
                            <button
                              key={l.lessonId}
                              onClick={() => toggleKnownLesson(l.lessonId)}
                              className={cn(
                                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                                lessonKnown ? 'bg-success/10' : 'hover:bg-foreground/5',
                              )}
                            >
                              <span className="text-xs font-medium text-muted">L{l.lessonNumber}</span>
                              <span className="flex-1 text-xs text-foreground">
                                Ayahs {l.ayahStart}–{l.ayahEnd}
                              </span>
                              <span
                                className={cn(
                                  'flex h-4 w-4 items-center justify-center rounded border-2',
                                  lessonKnown ? 'border-success bg-success text-on-success' : 'border-foreground/20',
                                )}
                              >
                                {lessonKnown && <CheckIcon size={10} />}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl space-y-3">
          {feasibility && feasibility.exceedsCurrentPace && (
            <div
              className={cn(
                'rounded-lg px-3 py-2 text-xs',
                feasibility.impossible
                  ? 'bg-red-500/10 text-red-500'
                  : 'bg-gold/10 text-gold',
              )}
            >
              {feasibility.impossible ? (
                <>
                  This scope would need <strong>{feasibility.required} lessons/day</strong> — beyond the 20/day sanity ceiling. Extend the deadline before saving.
                </>
              ) : feasibility.intensive ? (
                <>
                  This scope requires <strong>{feasibility.required} lessons/day</strong> to hit your deadline — intensive (above the typical 5/day). Bump your pace or extend the deadline after saving.
                </>
              ) : (
                <>
                  At your current pace of {plan.lessonsPerDay}/day, this scope requires <strong>{feasibility.required}/day</strong> to stay on deadline. Bump your pace or extend the deadline after saving.
                </>
              )}
            </div>
          )}
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => (step > 1 ? setStep(1) : router.push('/plan'))}
            >
              {step > 1 ? 'Back' : 'Cancel'}
            </Button>
            {step === 1 && !skipPreAssessment ? (
              <Button className="flex-1" disabled={!canAdvance} onClick={() => setStep(2)}>
                Next
              </Button>
            ) : (
              <Button className="flex-1" disabled={!canAdvance} onClick={handleSave}>
                Save
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
