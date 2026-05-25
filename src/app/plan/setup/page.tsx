'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { HifdhPlan, JuzMeta, PlanGoalType, SurahMeta } from '@/types/quran';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import { generateLessonsWithJuzBoundaries } from '@/lib/curriculum';
import {
  addDaysIso,
  countStudyDays,
  getPlanLessons,
  resolveGoalSurahIds,
  suggestedPace,
  todayIso,
} from '@/lib/plan';
import { usePlanStore } from '@/stores/plan-store';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import { CheckIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type Step = 1 | 2 | 3 | 4;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function PlanSetupPage() {
  const router = useRouter();
  const createPlan = usePlanStore((s) => s.createPlan);
  const existingPlan = usePlanStore((s) => s.plan);

  const [step, setStep] = useState<Step>(1);
  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);

  const [goalType, setGoalType] = useState<PlanGoalType>('juz');
  const [selectedSurahIds, setSelectedSurahIds] = useState<number[]>([]);
  const [selectedJuzNumbers, setSelectedJuzNumbers] = useState<number[]>([30]);
  const [surahSearch, setSurahSearch] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  const [knownSurahIds, setKnownSurahIds] = useState<number[]>([]);
  const [knownLessonIds, setKnownLessonIds] = useState<string[]>([]);
  const [expandedSurah, setExpandedSurah] = useState<number | null>(null);

  const [useDeadline, setUseDeadline] = useState(false);
  const [deadline, setDeadline] = useState<string>(addDaysIso(todayIso(), 60));
  const [lessonsPerDay, setLessonsPerDay] = useState(1);
  const [customPaceOpen, setCustomPaceOpen] = useState(false);
  const [studyDays, setStudyDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  // Reset pre-assessment whenever the scope changes, so stale entries don't carry over
  useEffect(() => {
    setKnownSurahIds([]);
    setKnownLessonIds([]);
    setExpandedSurah(null);
  }, [goalType, selectedJuzNumbers, selectedSurahIds]);

  // Resolved scope
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

  // Total lessons given current selection (for pace preview)
  const totalLessons = useMemo(() => {
    if (!allSurahs.length || !juzIndex.length || !goalSurahIds.length) return 0;
    const provisional: HifdhPlan = {
      id: 'preview',
      createdAt: 0,
      goalType,
      goalSurahIds,
      goalJuzNumbers: selectedJuzNumbers,
      deadline: null,
      knownSurahIds,
      lessonsPerDay: 1,
      studyDays: [0, 1, 2, 3, 4, 5, 6],
      completedLessonIds: [],
      revisionFrequencyDays: 7,
      lastRevisedAt: {},
    };
    return getPlanLessons(provisional, allSurahs, juzIndex).length;
  }, [goalType, goalSurahIds, selectedJuzNumbers, knownSurahIds, allSurahs, juzIndex]);

  // Auto-pace suggestion when deadline is set
  const paceSuggestion = useMemo(() => {
    if (!useDeadline || totalLessons === 0) return null;
    return suggestedPace(totalLessons, deadline, studyDays);
  }, [useDeadline, totalLessons, deadline, studyDays]);

  useEffect(() => {
    if (paceSuggestion) setLessonsPerDay(paceSuggestion.pace);
  }, [paceSuggestion]);

  // Projected finish when no deadline
  const projectedFinish = useMemo(() => {
    if (useDeadline || totalLessons === 0 || lessonsPerDay === 0) return null;
    const studyDayCount = Math.ceil(totalLessons / lessonsPerDay);
    if (studyDays.length === 0) return null;
    // Walk forward study days
    const today = todayIso();
    // Find the date N study days ahead
    const endIso = addDaysIso(today, Math.ceil((studyDayCount / studyDays.length) * 7) + 7);
    const actualStudyDays = countStudyDays(today, endIso, studyDays);
    if (actualStudyDays < studyDayCount) {
      return addDaysIso(today, 365); // fallback
    }
    // Binary-search free: we over-estimate then trim
    let cursor = today;
    let remaining = studyDayCount;
    const set = new Set(studyDays);
    const d = new Date(cursor + 'T00:00:00');
    while (remaining > 0) {
      if (set.has(d.getDay())) remaining--;
      if (remaining > 0) d.setDate(d.getDate() + 1);
    }
    return d.toISOString().split('T')[0];
  }, [useDeadline, totalLessons, lessonsPerDay, studyDays]);

  // Filtered surah list for the picker
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
  const toggleStudyDay = (d: number) =>
    setStudyDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const skipPreAssessment = goalType === 'surah';
  const totalSteps = skipPreAssessment ? 3 : 4;
  const visibleStep = skipPreAssessment && step > 1 ? step - 1 : step;

  const goNext = () => {
    if (step === 1 && skipPreAssessment) setStep(3);
    else if (step < 4) setStep((step + 1) as Step);
  };
  const goBack = () => {
    if (step === 3 && skipPreAssessment) setStep(1);
    else if (step > 1) setStep((step - 1) as Step);
    else router.push('/');
  };

  const canAdvanceFrom1 =
    (goalType === 'full-quran') ||
    (goalType === 'juz' && selectedJuzNumbers.length > 0) ||
    (goalType === 'surah' && selectedSurahIds.length > 0);

  const canAdvanceFrom3 =
    studyDays.length > 0 &&
    lessonsPerDay >= 1 &&
    lessonsPerDay <= 20 &&
    (!useDeadline || deadline > todayIso()) &&
    totalLessons - knownSurahIds.length > 0;

  const handleCreate = () => {
    createPlan({
      goalType,
      surahIds: goalType === 'surah' ? selectedSurahIds : undefined,
      juzNumbers: goalType === 'juz' ? selectedJuzNumbers : undefined,
      deadline: useDeadline ? deadline : null,
      knownSurahIds,
      knownLessonIds,
      lessonsPerDay,
      studyDays,
      juzIndex,
    });
    router.push('/');
  };

  return (
    <div className="min-h-screen bg-cream pb-28">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-4 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Step {visibleStep} of {totalSteps}</p>
              <h1 className="text-xl font-bold text-teal">
                {step === 1 && 'What do you want to memorize?'}
                {step === 2 && 'Do you already know any of these?'}
                {step === 3 && 'Set your pace'}
                {step === 4 && 'Ready to start'}
              </h1>
            </div>
            {existingPlan && step === 1 && (
              <button
                onClick={() => router.push('/plan')}
                className="text-xs font-semibold text-muted hover:text-foreground"
              >
                Cancel
              </button>
            )}
          </div>
          {/* Progress */}
          <div className="mt-3 flex gap-1">
            {Array.from({ length: totalSteps }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 flex-1 rounded-full transition-colors',
                  s <= visibleStep ? 'bg-teal' : 'bg-foreground/10',
                )}
              />
            ))}
          </div>
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
                  <p className="mt-1 text-[11px] text-muted">
                    {type === 'surah' ? 'Pick any surahs' : type === 'juz' ? 'Pick any juz' : 'All 114 surahs'}
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
                    className="w-16 rounded-lg border border-foreground/10 bg-card px-2 py-1 text-xs text-foreground focus:border-teal/40 focus:outline-none"
                  />
                  <span className="text-xs text-muted">–</span>
                  <input
                    type="number"
                    min={1}
                    max={114}
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value)}
                    placeholder="to"
                    className="w-16 rounded-lg border border-foreground/10 bg-card px-2 py-1 text-xs text-foreground focus:border-teal/40 focus:outline-none"
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
                    className="rounded-lg bg-teal px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
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
                <p className="mt-2 text-xs text-muted">
                  {selectedSurahIds.length} selected
                </p>
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
                        <span className="text-[10px] text-muted">{s.versesCount} ayah</span>
                        <span
                          className={cn(
                            'flex h-5 w-5 items-center justify-center rounded border-2',
                            selected ? 'border-teal bg-teal text-white' : 'border-foreground/20',
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
                            ? 'border-teal bg-teal text-white'
                            : 'border-foreground/10 text-foreground hover:border-teal/30',
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-muted">Tip: Juz 30 (bottom row) is shortest and usually memorized first.</p>
              </Card>
            )}

            {goalType === 'full-quran' && (
              <Card>
                <p className="text-sm text-foreground">You're setting a goal to memorize the entire Quran — all 114 surahs, 6236 ayahs.</p>
                <p className="mt-2 text-xs text-muted">
                  The curriculum orders surahs shortest-first (Juz 30, 29, 28, then the rest in traditional order).
                </p>
              </Card>
            )}
          </>
        )}

        {step === 2 && (
          <Card>
            <p className="text-sm text-muted">
              Tick any surahs you&apos;ve memorized. Tap a surah to mark individual lessons instead.
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
                  <div key={s.id}>
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
                            known ? 'border-success bg-success text-white' : 'border-foreground/20',
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
                                  lessonKnown ? 'border-success bg-success text-white' : 'border-foreground/20',
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
            <button
              onClick={() => { setKnownSurahIds([]); setKnownLessonIds([]); }}
              className="mt-3 text-xs font-semibold text-muted hover:text-foreground"
            >
              I&apos;m starting fresh →
            </button>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Target date</p>
                  <p className="text-xs text-muted">Optional — we&apos;ll calculate the pace for you</p>
                </div>
                <button
                  onClick={() => setUseDeadline((v) => !v)}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    useDeadline ? 'bg-teal' : 'bg-foreground/20',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                      useDeadline ? 'left-5' : 'left-0.5',
                    )}
                  />
                </button>
              </div>
              {useDeadline && (
                <div className="mt-3">
                  <input
                    type="date"
                    value={deadline}
                    min={addDaysIso(todayIso(), 1)}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full rounded-xl border border-foreground/10 bg-card px-4 py-2.5 text-sm text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                  />
                  {paceSuggestion && (
                    <p className={cn(
                      'mt-2 text-xs',
                      paceSuggestion.impossible
                        ? 'text-red-500'
                        : paceSuggestion.ambitious
                          ? 'text-gold'
                          : 'text-muted',
                    )}>
                      {paceSuggestion.impossible
                        ? `This would need ${Math.ceil(totalLessons / Math.max(1, countStudyDays(todayIso(), deadline, studyDays)))} lessons/day — beyond the 20/day ceiling. Extend the date.`
                        : paceSuggestion.ambitious
                          ? `Deadline requires ${paceSuggestion.pace} lessons/day — intensive. Extend the date for a gentler pace.`
                          : `To finish by this date: ${paceSuggestion.pace} lesson${paceSuggestion.pace > 1 ? 's' : ''}/day on study days.`}
                    </p>
                  )}
                </div>
              )}
            </Card>

            <Card>
              <p className="text-sm font-semibold text-foreground">Lessons per day</p>
              <p className="text-xs text-muted">
                {useDeadline ? 'Auto-calculated from your deadline — adjust if needed' : 'How many new lessons will you tackle on a study day?'}
              </p>
              {(() => {
                const isCustom = lessonsPerDay > 5 || customPaceOpen;
                return (
                  <>
                    <div className="mt-3 grid grid-cols-6 gap-2">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => { setLessonsPerDay(n); setCustomPaceOpen(false); }}
                          className={cn(
                            'rounded-xl border-2 py-2 text-sm font-semibold transition-colors',
                            !isCustom && lessonsPerDay === n
                              ? 'border-teal bg-teal text-white'
                              : 'border-foreground/10 text-foreground hover:border-teal/30',
                          )}
                        >
                          {n}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          setCustomPaceOpen(true);
                          if (lessonsPerDay <= 5) setLessonsPerDay(6);
                        }}
                        className={cn(
                          'rounded-xl border-2 py-2 text-xs font-semibold transition-colors',
                          isCustom
                            ? 'border-teal bg-teal text-white'
                            : 'border-foreground/10 text-foreground hover:border-teal/30',
                        )}
                      >
                        {isCustom ? lessonsPerDay : '6+'}
                      </button>
                    </div>
                    {isCustom && (
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={lessonsPerDay}
                          onChange={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (!Number.isFinite(v)) return;
                            setLessonsPerDay(Math.max(1, Math.min(20, v)));
                          }}
                          className="w-24 rounded-lg border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                        />
                        <span className="text-xs text-muted">lessons/day (max 20)</span>
                      </div>
                    )}
                    {lessonsPerDay > 5 && (
                      <p className="mt-2 text-xs text-gold">
                        Intensive pace — traditional hifdh is 1–2/day. Above 5 is retreat/Ramadan-intensive territory. Plan realistically.
                      </p>
                    )}
                  </>
                );
              })()}
              {!useDeadline && projectedFinish && (
                <p className="mt-3 text-xs text-muted">
                  At this pace you&apos;ll finish around{' '}
                  <span className="font-semibold text-foreground">
                    {new Date(projectedFinish + 'T00:00:00').toLocaleDateString(undefined, {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>{' '}
                  ({totalLessons - knownSurahIds.length > 0 ? totalLessons : 0} lessons).
                </p>
              )}
            </Card>

            <Card>
              <p className="text-sm font-semibold text-foreground">Study days</p>
              <p className="text-xs text-muted">Rest days will only show reviews — no new lessons.</p>
              <div className="mt-3 flex gap-1.5">
                {DAY_LABELS.map((label, d) => {
                  const selected = studyDays.includes(d);
                  return (
                    <button
                      key={d}
                      onClick={() => toggleStudyDay(d)}
                      className={cn(
                        'flex-1 rounded-lg border-2 py-2 text-xs font-semibold transition-colors',
                        selected
                          ? 'border-teal bg-teal text-white'
                          : 'border-foreground/10 text-muted hover:border-teal/30',
                      )}
                      title={DAY_NAMES[d]}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Card>
          </>
        )}

        {step === 4 && (
          <Card className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Goal</p>
              <p className="mt-0.5 text-base font-semibold text-foreground">
                {goalType === 'full-quran' && 'Memorize the full Quran'}
                {goalType === 'juz' &&
                  `Memorize ${selectedJuzNumbers.length === 1 ? `Juz ${selectedJuzNumbers[0]}` : `${selectedJuzNumbers.length} juz`}`}
                {goalType === 'surah' &&
                  `Memorize ${selectedSurahIds.length} surah${selectedSurahIds.length === 1 ? '' : 's'}`}
              </p>
              <p className="text-xs text-muted">
                {totalLessons} lessons{knownSurahIds.length > 0 && ` (${knownSurahIds.length} surah${knownSurahIds.length === 1 ? '' : 's'} already known)`}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pace</p>
              <p className="mt-0.5 text-sm text-foreground">
                {lessonsPerDay} lesson{lessonsPerDay === 1 ? '' : 's'}/day on{' '}
                {studyDays.length === 7 ? 'every day' : `${studyDays.length} day${studyDays.length === 1 ? '' : 's'} a week`}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                {useDeadline ? 'Deadline' : 'Projected finish'}
              </p>
              <p className="mt-0.5 text-sm text-foreground">
                {useDeadline
                  ? new Date(deadline + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })
                  : projectedFinish
                    ? new Date(projectedFinish + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })
                    : '—'}
              </p>
            </div>
            <p className="pt-2 text-xs text-muted">
              You&apos;ll also see due reviews and periodic revisions of completed surahs each day.
            </p>
          </Card>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 border-t border-foreground/5 bg-cream/95 p-4 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl gap-3">
          <Button variant="ghost" className="flex-1" onClick={goBack}>
            {step > 1 ? 'Back' : 'Cancel'}
          </Button>
          {step < 4 ? (
            <Button
              className="flex-1"
              disabled={(step === 1 && !canAdvanceFrom1) || (step === 3 && !canAdvanceFrom3)}
              onClick={goNext}
            >
              Next
            </Button>
          ) : (
            <Button className="flex-1" onClick={handleCreate}>
              Start Plan
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
