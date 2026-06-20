'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { JuzMeta, SurahMeta } from '@/types/quran';
import { usePlanStore } from '@/stores/plan-store';
import { useProgressStore } from '@/stores/progress-store';
import { getJuzIndex, getSurahIndex } from '@/lib/quran-data';
import {
  autoRevisionFrequencyDays,
  computePlanProgress,
  effectiveRevisionFrequency,
  getPlanLessons,
  todayIso,
} from '@/lib/plan';
import Button from '@/components/ui/button';
import Card from '@/components/ui/card';
import ProgressBar from '@/components/ui/progress-bar';
import BottomNav from '@/components/layout/bottom-nav';
import { ArrowRightIcon, CheckIcon, TrashIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function PlanDashboardPage() {
  const router = useRouter();
  const plan = usePlanStore((s) => s.plan);
  const updatePace = usePlanStore((s) => s.updatePace);
  const updateDeadline = usePlanStore((s) => s.updateDeadline);
  const updateStudyDays = usePlanStore((s) => s.updateStudyDays);
  const updateRevisionFrequency = usePlanStore((s) => s.updateRevisionFrequency);
  const setRevisionFrequencyAuto = usePlanStore((s) => s.setRevisionFrequencyAuto);
  const deletePlan = usePlanStore((s) => s.deletePlan);
  const progressLessons = useProgressStore((s) => s.lessons);

  const [allSurahs, setAllSurahs] = useState<SurahMeta[]>([]);
  const [juzIndex, setJuzIndex] = useState<JuzMeta[]>([]);
  const [showDelete, setShowDelete] = useState(false);
  const [customPaceOpen, setCustomPaceOpen] = useState(false);

  useEffect(() => {
    getSurahIndex().then(setAllSurahs);
    getJuzIndex().then(setJuzIndex);
  }, []);

  const planLessons = useMemo(() => {
    if (!plan || !allSurahs.length || !juzIndex.length) return [];
    return getPlanLessons(plan, allSurahs, juzIndex);
  }, [plan, allSurahs, juzIndex]);

  const progress = useMemo(() => {
    if (!plan || !planLessons.length) return null;
    return computePlanProgress(plan, planLessons, progressLessons);
  }, [plan, planLessons, progressLessons]);

  const surahBreakdown = useMemo(() => {
    if (!plan || !planLessons.length) return [];
    const byId = new Map(allSurahs.map((s) => [s.id, s]));
    const bySurah = new Map<number, { total: number; done: number; name: string; arabic: string }>();
    for (const l of planLessons) {
      const surah = byId.get(l.surahId);
      if (!surah) continue;
      const cur = bySurah.get(l.surahId) ?? {
        total: 0,
        done: 0,
        name: surah.nameSimple,
        arabic: surah.nameArabic,
      };
      cur.total++;
      if (progressLessons[l.lessonId]?.completedAt) cur.done++;
      bySurah.set(l.surahId, cur);
    }
    return Array.from(bySurah.entries()).map(([id, v]) => ({ surahId: id, ...v }));
  }, [plan, planLessons, allSurahs, progressLessons]);

  if (!plan) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <main className="mx-auto max-w-2xl px-4 py-10">
          <Card className="text-center">
            <h1 className="text-xl font-bold text-teal">No plan yet</h1>
            <p className="mt-2 text-sm text-muted">
              Set a hifdh goal and get a daily plan tailored to your pace.
            </p>
            <Button className="mt-4 w-full" onClick={() => router.push('/plan/setup')}>
              Create a plan
            </Button>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="min-h-screen bg-cream pb-24">
        <main className="mx-auto max-w-2xl px-4 py-10">
          <p className="text-center text-sm text-muted">Loading plan…</p>
        </main>
        <BottomNav />
      </div>
    );
  }

  const goalLabel =
    plan.goalType === 'full-quran'
      ? 'Full Quran'
      : plan.goalType === 'juz'
        ? plan.goalJuzNumbers.length === 1
          ? `Juz ${plan.goalJuzNumbers[0]}`
          : `${plan.goalJuzNumbers.length} juz`
        : `${plan.goalSurahIds.length} surah${plan.goalSurahIds.length === 1 ? '' : 's'}`;

  const toggleStudyDay = (d: number) => {
    const next = plan.studyDays.includes(d)
      ? plan.studyDays.filter((x) => x !== d)
      : [...plan.studyDays, d];
    if (next.length > 0) updateStudyDays(next);
  };

  return (
    <div className="min-h-screen bg-cream pb-24">
      <header className="sticky top-0 z-10 bg-cream/95 px-4 pt-6 pb-3 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your plan</p>
            <h1 className="text-xl font-bold text-teal">{goalLabel}</h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/plan/edit" className="text-xs font-semibold text-teal hover:underline">Edit goal</a>
            <a href="/" className="text-xs font-semibold text-muted hover:text-foreground">Home</a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-3">
        {/* Progress hero */}
        <Card>
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 shrink-0">
              <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                  className="text-foreground/10" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3"
                  strokeDasharray={`${progress.percentage} 100`}
                  strokeLinecap="round"
                  className={progress.percentage >= 100 ? 'text-success' : 'text-teal'} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                  'text-lg font-bold',
                  progress.percentage >= 100 ? 'text-success' : 'text-teal',
                )}>
                  {progress.percentage}%
                </span>
                <span className="text-[10px] text-muted">complete</span>
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Lessons</p>
                <p className="text-sm font-semibold text-foreground">
                  {progress.completedLessons} / {progress.totalLessons}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted">Current pace</p>
                <p className="text-sm font-semibold text-foreground">
                  {progress.currentPace} lessons/day
                </p>
              </div>
            </div>
          </div>

          <div
            className={cn(
              'mt-4 rounded-lg px-3 py-2 text-xs font-medium',
              !plan.deadline
                ? 'bg-teal/10 text-teal'
                : progress.isOnTrack
                  ? 'bg-success/10 text-success'
                  : 'bg-gold/10 text-gold',
            )}
          >
            {!plan.deadline && progress.projectedFinishDate && progress.lessonsRemaining > 0 && (
              <>Projected finish: {new Date(progress.projectedFinishDate + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'long' })}</>
            )}
            {!plan.deadline && progress.lessonsRemaining === 0 && 'Plan complete — ma shaa Allah'}
            {plan.deadline && progress.isOnTrack && (
              <>On track · {progress.daysRemaining ?? 0}d remaining</>
            )}
            {plan.deadline && !progress.isOnTrack && (
              <>{progress.lessonsBehind} lesson{progress.lessonsBehind === 1 ? '' : 's'} behind · {progress.daysRemaining ?? 0}d remaining</>
            )}
          </div>
        </Card>

        {/* Pace */}
        <Card>
          <p className="text-sm font-semibold text-foreground">Lessons per day</p>
          <p className="text-xs text-muted">
            {plan.deadline
              ? 'Adjusting this may affect your deadline'
              : 'How many new lessons per study day'}
          </p>
          {(() => {
            const isCustom = plan.lessonsPerDay > 5 || customPaceOpen;
            return (
              <>
                <div className="mt-3 grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => { updatePace(n); setCustomPaceOpen(false); }}
                      className={cn(
                        'rounded-xl border-2 py-2 text-sm font-semibold transition-colors',
                        !isCustom && plan.lessonsPerDay === n
                          ? 'border-teal bg-teal text-on-teal'
                          : 'border-foreground/10 text-foreground hover:border-teal/30',
                      )}
                    >
                      {n}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setCustomPaceOpen(true);
                      if (plan.lessonsPerDay <= 5) updatePace(6);
                    }}
                    className={cn(
                      'rounded-xl border-2 py-2 text-xs font-semibold transition-colors',
                      isCustom
                        ? 'border-teal bg-teal text-on-teal'
                        : 'border-foreground/10 text-foreground hover:border-teal/30',
                    )}
                  >
                    {isCustom ? plan.lessonsPerDay : '6+'}
                  </button>
                </div>
                {isCustom && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={plan.lessonsPerDay}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!Number.isFinite(v)) return;
                        updatePace(Math.max(1, Math.min(20, v)));
                      }}
                      className="w-24 rounded-lg border border-foreground/10 bg-card px-3 py-2 text-sm text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
                    />
                    <span className="text-xs text-muted">lessons/day (max 20)</span>
                  </div>
                )}
                {plan.lessonsPerDay > 5 && (
                  <p className="mt-2 text-xs text-gold">
                    Intensive pace — traditional hifdh is 1–2/day. Above 5 is retreat/Ramadan-intensive territory.
                  </p>
                )}
              </>
            );
          })()}
        </Card>

        {/* Deadline */}
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Target date</p>
              <p className="text-xs text-muted">Optional</p>
            </div>
            <button
              onClick={() =>
                updateDeadline(
                  plan.deadline
                    ? null
                    : (() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 60);
                        return d.toISOString().split('T')[0];
                      })(),
                )
              }
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                plan.deadline ? 'bg-teal' : 'bg-foreground/20',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                  plan.deadline ? 'left-5' : 'left-0.5',
                )}
              />
            </button>
          </div>
          {plan.deadline && (
            <input
              type="date"
              value={plan.deadline}
              min={todayIso()}
              onChange={(e) => updateDeadline(e.target.value)}
              className="mt-3 w-full rounded-xl border border-foreground/10 bg-card px-4 py-2.5 text-sm text-foreground focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20"
            />
          )}
        </Card>

        {/* Study days */}
        <Card>
          <p className="text-sm font-semibold text-foreground">Study days</p>
          <div className="mt-3 flex gap-1.5">
            {DAY_LABELS.map((label, d) => {
              const selected = plan.studyDays.includes(d);
              return (
                <button
                  key={d}
                  onClick={() => toggleStudyDay(d)}
                  className={cn(
                    'flex-1 rounded-lg border-2 py-2 text-xs font-semibold transition-colors',
                    selected
                      ? 'border-teal bg-teal text-on-teal'
                      : 'border-foreground/10 text-muted hover:border-teal/30',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Revision frequency */}
        <Card>
          {(() => {
            const completedCount = surahBreakdown.filter((s) => s.done === s.total && s.total > 0).length;
            const auto = !!plan.revisionFrequencyAuto;
            const effective = effectiveRevisionFrequency(plan, completedCount);
            const freq = auto ? effective : plan.revisionFrequencyDays;
            const presets: Array<{ days: number; label: string }> = [
              { days: 3, label: 'Intensive' },
              { days: 7, label: 'Balanced' },
              { days: 14, label: 'Light' },
            ];
            let recommendation: string;
            if (completedCount === 0) {
              recommendation = 'Revisions kick in once you finish your first surah.';
            } else if (completedCount <= 5) {
              recommendation = `You have ${completedCount} completed surah${completedCount === 1 ? '' : 's'}. Intensive (3d) helps lock early wins in.`;
            } else if (completedCount <= 15) {
              recommendation = `You have ${completedCount} completed surahs. Weekly (7d) is the sweet spot at this stage.`;
            } else {
              recommendation = `You have ${completedCount} completed surahs. Light (14d) keeps the daily plan from flooding.`;
            }

            return (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Revision frequency</p>
                    <p className="text-xs text-muted">How often completed surahs come back for full recall</p>
                  </div>
                  <p className="text-sm font-semibold text-teal">
                    Every {freq}d
                    {auto && <span className="ml-1 text-[10px] font-normal text-muted">(auto)</span>}
                  </p>
                </div>

                {/* Auto toggle */}
                <div className="mt-3 flex items-center justify-between rounded-xl bg-foreground/5 px-3 py-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Auto-adjust</p>
                    <p className="text-[11px] text-muted">Shifts frequency as your plan grows</p>
                  </div>
                  <button
                    onClick={() => setRevisionFrequencyAuto(!auto)}
                    className={cn(
                      'relative h-6 w-11 rounded-full transition-colors',
                      auto ? 'bg-teal' : 'bg-foreground/20',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all',
                        auto ? 'left-5' : 'left-0.5',
                      )}
                    />
                  </button>
                </div>

                <div className={cn('mt-3 grid grid-cols-3 gap-2', auto && 'opacity-50 pointer-events-none')}>
                  {presets.map((p) => (
                    <button
                      key={p.days}
                      onClick={() => updateRevisionFrequency(p.days)}
                      className={cn(
                        'rounded-xl border-2 py-2 text-xs font-semibold transition-colors',
                        freq === p.days
                          ? 'border-teal bg-teal text-on-teal'
                          : 'border-foreground/10 text-foreground hover:border-teal/30',
                      )}
                    >
                      <span className="block">{p.label}</span>
                      <span className={cn('block text-[10px] font-normal', freq === p.days ? 'text-on-teal/80' : 'text-muted')}>
                        {p.days}d
                      </span>
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={1}
                  max={30}
                  value={freq}
                  disabled={auto}
                  onChange={(e) => updateRevisionFrequency(parseInt(e.target.value, 10))}
                  className={cn('mt-3 w-full accent-teal', auto && 'opacity-50')}
                />
                <p className="mt-2 text-[11px] text-muted">
                  {auto
                    ? `Auto-set to ${effective}d based on ${completedCount} completed surah${completedCount === 1 ? '' : 's'}. Will shift as you progress.`
                    : recommendation}
                </p>
              </>
            );
          })()}
        </Card>

        {/* Surah breakdown */}
        <Card>
          <p className="text-sm font-semibold text-foreground">Surahs in plan</p>
          <div className="mt-3 space-y-1 max-h-[50vh] overflow-y-auto">
            {surahBreakdown.map((s) => {
              const pct = s.total > 0 ? (s.done / s.total) * 100 : 0;
              const complete = s.done === s.total && s.total > 0;
              return (
                <a
                  key={s.surahId}
                  href={`/lesson/${s.surahId}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-foreground/5"
                >
                  <span className="w-7 text-right text-xs font-medium text-muted">{s.surahId}</span>
                  <span className="arabic-text text-base leading-none">{s.arabic}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{s.name}</p>
                    <div className="mt-1 flex items-center gap-2">
                      <ProgressBar value={pct} className="flex-1" />
                      <span className="text-[10px] text-muted">{s.done}/{s.total}</span>
                    </div>
                  </div>
                  {complete ? (
                    <CheckIcon size={14} className="text-success" />
                  ) : (
                    <ArrowRightIcon size={12} className="text-muted" />
                  )}
                </a>
              );
            })}
          </div>
        </Card>

        {/* Delete plan */}
        <button
          onClick={() => setShowDelete(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium text-red-400/70 transition-colors hover:text-red-400"
        >
          <TrashIcon size={14} /> Delete plan
        </button>

        {showDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="mx-4 w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl">
              <h3 className="text-lg font-bold text-foreground">Delete plan?</h3>
              <p className="mt-2 text-sm text-muted">
                This removes your goal and daily plan. Your lesson progress and reviews stay intact.
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => setShowDelete(false)}
                  className="flex-1 rounded-xl border border-foreground/10 py-2.5 text-sm font-medium text-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deletePlan();
                    setShowDelete(false);
                    router.push('/');
                  }}
                  className="flex-1 rounded-xl bg-miss py-2.5 text-sm font-medium text-on-miss"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
