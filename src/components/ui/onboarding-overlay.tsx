'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ayah, ArabicScriptStyle } from '@/types/quran';
import { NAV_FORWARD } from '@/lib/nav';
import { getSurah } from '@/lib/quran-data';
import { lessonHref, listenHref } from '@/lib/routes';
import { lessonWordCounts } from '@/lib/curriculum';
import { formatLessonTime } from '@/lib/lesson-time';
import { setIntent, type Intent } from '@/lib/intent';
import { useSettingsStore } from '@/stores/settings-store';
import ArabicText from '@/components/ui/arabic-text';
import { ChevronLeftIcon } from '@/components/ui/icons';
import { cn } from '@/lib/cn';

type Step = 'welcome' | 'intent' | 'look' | 'finish';
const STEPS: Step[] = ['welcome', 'intent', 'look', 'finish'];

const INTENTS: { value: Intent; title: string; sub: string }[] = [
  { value: 'learn', title: "I'm new to memorizing", sub: 'Start with a first surah, one ayah at a time' },
  { value: 'memorized-some', title: "I've memorized some already", sub: 'Keep what you know and add more' },
  { value: 'revise', title: 'I want to keep what I know', sub: 'Recite from memory and check yourself' },
  { value: 'listen', title: 'I just want to read and listen', sub: 'Follow the text while it is recited' },
];

const SCRIPTS: { value: ArabicScriptStyle; label: string; note: string }[] = [
  { value: 'tajweed', label: 'Tajweed', note: 'Colours mark pronunciation rules' },
  { value: 'uthmani', label: 'Uthmani', note: 'The Madinah mushaf style' },
  { value: 'indopak', label: 'IndoPak', note: 'Common in South Asia' },
];

const FIRST_SURAHS = [
  { id: 1, name: 'Al-Fatihah', ayahs: 7, why: 'The opening. Recited in every prayer.' },
  { id: 112, name: 'Al-Ikhlas', ayahs: 4, why: 'Short and a gentle first step.' },
];

/**
 * First run (redesigned 2026-09-27 from the persona tests). Asks what the person
 * came to do, lets them set the script and size they read best, then hands off to
 * the right place: a first lesson, plan setup, or Recite/Listen. Skippable at
 * every step; no permissions, no sign-in.
 */
export default function OnboardingOverlay() {
  const router = useRouter();
  // Client-only render (Providers waits for mount), so storage can be read up front
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && !localStorage.getItem('onboarding-complete'));
  const [step, setStep] = useState<Step>('welcome');
  const [intent, setIntentState] = useState<Intent | null>(null);
  const [sample, setSample] = useState<Ayah | null>(null);
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const setArabicScript = useSettingsStore((s) => s.setArabicScript);
  const arabicFontSize = useSettingsStore((s) => s.arabicFontSize);
  const setArabicFontSize = useSettingsStore((s) => s.setArabicFontSize);

  // The script preview is a real ayah, so tajweed colours and IndoPak forms show as they will
  useEffect(() => {
    if (step === 'look' && !sample) getSurah(1).then((s) => setSample(s.ayahs[0]));
  }, [step, sample]);

  const dismiss = () => {
    localStorage.setItem('onboarding-complete', 'true');
    setVisible(false);
  };

  const finishTo = (href: string | null) => {
    dismiss();
    if (href) router.push(href, { transitionTypes: [NAV_FORWARD] });
  };

  const back = () => {
    const i = STEPS.indexOf(step);
    if (i > 0) setStep(STEPS[i - 1]);
  };

  const chooseIntent = (value: Intent) => {
    setIntentState(value);
    setIntent(value);
    setStep('look');
  };

  if (!visible) return null;

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-y-auto bg-cream pt-[var(--safe-top)]">
      <div className="flex items-center justify-between px-4 pt-3">
        {stepIndex > 0 ? (
          <button onClick={back} className="-ml-1 flex min-h-11 items-center gap-0.5 px-2 text-sm text-muted hover:text-foreground">
            <ChevronLeftIcon size={18} /> Back
          </button>
        ) : <span />}
        <button onClick={dismiss} className="min-h-11 px-3 text-sm font-medium text-muted hover:text-foreground">
          Skip
        </button>
      </div>

      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col px-6 pb-10">
        {/* Progress dots */}
        <div className="mt-2 flex justify-center gap-2" aria-hidden>
          {STEPS.map((s, i) => (
            <span key={s} className={cn('h-2 rounded-full transition-all', i === stepIndex ? 'w-6 bg-teal' : 'w-2 bg-foreground/15')} />
          ))}
        </div>

        {step === 'welcome' && (
          <div className="flex flex-1 flex-col justify-center text-center">
            <p className="arabic-text text-4xl text-teal">تكرار</p>
            <h2 className="mt-4 text-2xl font-bold text-teal">Welcome to Takrar</h2>
            <p className="mt-3 text-base leading-relaxed text-muted">
              Memorize the Quran through steady repetition, keep what you already know, or simply recite and listen.
            </p>
            <button onClick={() => setStep('intent')} className="tactile-btn mt-10 min-h-12 w-full rounded-xl bg-teal text-base font-semibold text-on-teal">
              Get started
            </button>
          </div>
        )}

        {step === 'intent' && (
          <div className="flex flex-1 flex-col justify-center">
            <h2 className="text-center text-2xl font-bold text-teal">What brings you here?</h2>
            <p className="mt-2 text-center text-sm text-muted">You can do all of these later. This just decides where you start.</p>
            <div className="mt-6 space-y-2.5">
              {INTENTS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => chooseIntent(o.value)}
                  className={cn(
                    'tactile-chip w-full rounded-xl bg-card px-4 py-3.5 text-left',
                    intent === o.value && 'border-teal',
                  )}
                >
                  <span className="block text-base font-semibold text-foreground">{o.title}</span>
                  <span className="mt-0.5 block text-sm text-muted">{o.sub}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'look' && (
          <div className="flex flex-1 flex-col justify-center">
            <h2 className="text-center text-2xl font-bold text-teal">How should the Quran look?</h2>
            <p className="mt-2 text-center text-sm text-muted">Pick the script you read best, and a comfortable size.</p>

            <div className="mt-5 rounded-2xl bg-card px-4 py-5 text-center">
              {sample ? <ArabicText ayah={sample} className="text-3xl leading-loose" /> : <div className="h-14" />}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Arabic script">
              {SCRIPTS.map((s) => (
                <button
                  key={s.value}
                  role="radio"
                  aria-checked={arabicScript === s.value}
                  onClick={() => setArabicScript(s.value)}
                  className={cn(
                    'min-h-12 rounded-xl px-2 text-sm font-semibold transition-colors',
                    arabicScript === s.value ? 'bg-teal text-on-teal' : 'bg-foreground/5 text-muted hover:text-foreground',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-muted">{SCRIPTS.find((s) => s.value === arabicScript)?.note}</p>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setArabicFontSize(Math.max(0.8, Math.round((arabicFontSize - 0.1) * 10) / 10))}
                disabled={arabicFontSize <= 0.8}
                aria-label="Smaller Arabic text"
                className="pressable flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5 text-lg font-bold text-muted disabled:opacity-30"
              >
                −
              </button>
              <p className="flex-1 text-center text-sm text-muted">Text size {Math.round(arabicFontSize * 100)}%</p>
              <button
                onClick={() => setArabicFontSize(Math.min(2, Math.round((arabicFontSize + 0.1) * 10) / 10))}
                disabled={arabicFontSize >= 2}
                aria-label="Larger Arabic text"
                className="pressable flex h-12 w-12 items-center justify-center rounded-xl bg-foreground/5 text-lg font-bold text-muted disabled:opacity-30"
              >
                +
              </button>
            </div>

            <button onClick={() => setStep('finish')} className="tactile-btn mt-8 min-h-12 w-full rounded-xl bg-teal text-base font-semibold text-on-teal">
              Continue
            </button>
          </div>
        )}

        {step === 'finish' && (
          <div className="flex flex-1 flex-col justify-center">
            {(intent === 'learn' || intent === null) && (
              <>
                <h2 className="text-center text-2xl font-bold text-teal">Where would you like to start?</h2>
                <p className="mt-2 text-center text-sm text-muted">Progress saves as you go, so you can stop whenever you need to.</p>
                <div className="mt-6 space-y-2.5">
                  {FIRST_SURAHS.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => finishTo(lessonHref(s.id, 1))}
                      className="tactile-chip w-full rounded-xl bg-card px-4 py-3.5 text-left"
                    >
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-base font-semibold text-foreground">{s.name}</span>
                        <span className="text-xs text-muted">
                          {s.ayahs} ayahs · {formatLessonTime(lessonWordCounts({ surahId: s.id, ayahStart: 1, ayahEnd: s.ayahs }))}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{s.why}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => finishTo(null)} className="mt-4 min-h-11 text-sm font-medium text-teal">
                  I&apos;ll choose from the list
                </button>
              </>
            )}

            {intent === 'memorized-some' && (
              <FinishCard
                title="Let's build a plan around what you know"
                body="Tell the planner which surahs you already have. It schedules their revision next to your new lessons, so nothing fades while you add more."
                primary={{ label: 'Set up my plan', onClick: () => finishTo('/plan/setup') }}
                secondary={{ label: 'Look around first', onClick: () => finishTo(null) }}
              />
            )}

            {intent === 'revise' && (
              <FinishCard
                title="Keep what you know"
                body="Open any surah you know and tap Recite from memory. Peek at an ayah or hear it whenever you stumble. A revision plan can also schedule this for you."
                primary={{ label: 'Plan my revision', onClick: () => finishTo('/plan/setup?goal=maintain') }}
                secondary={{ label: 'Choose a surah', onClick: () => finishTo(null) }}
              />
            )}

            {intent === 'listen' && (
              <FinishCard
                title="Read and listen"
                body="Open any surah and tap Listen. The text follows the recitation, and you can tap any ayah to play from there."
                primary={{ label: 'Listen to Al-Fatihah', onClick: () => finishTo(listenHref(1)) }}
                secondary={{ label: 'Choose a surah', onClick: () => finishTo(null) }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FinishCard({ title, body, primary, secondary }: {
  title: string;
  body: string;
  primary: { label: string; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}) {
  return (
    <div className="text-center">
      <h2 className="text-2xl font-bold text-teal">{title}</h2>
      <p className="mt-3 text-base leading-relaxed text-muted">{body}</p>
      <button onClick={primary.onClick} className="tactile-btn mt-8 min-h-12 w-full rounded-xl bg-teal text-base font-semibold text-on-teal">
        {primary.label}
      </button>
      <button onClick={secondary.onClick} className="mt-3 min-h-11 w-full text-sm font-medium text-teal">
        {secondary.label}
      </button>
    </div>
  );
}
