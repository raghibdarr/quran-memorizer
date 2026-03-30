'use client';

import { useState, useEffect, useRef } from 'react';

function BookIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
    </svg>
  );
}

function StepsIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
    </svg>
  );
}

function RepeatIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
    </svg>
  );
}

function StartIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--c-teal)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polygon points="10 8 16 12 10 16 10 8" fill="var(--c-teal)" />
    </svg>
  );
}

const CARDS = [
  {
    icon: BookIcon,
    title: 'Welcome to Takrar',
    subtitle: 'Memorize the Quran through structured repetition — step by step, ayah by ayah.',
  },
  {
    icon: StepsIcon,
    title: 'How It Works',
    subtitle: 'Each lesson takes you through 5 phases:',
    phases: [
      { label: 'Listen', desc: 'Hear the recitation' },
      { label: 'Understand', desc: 'Learn the meaning' },
      { label: 'Build', desc: 'Memorize through repetition' },
      { label: 'Test', desc: 'Prove your recall' },
      { label: 'Done', desc: 'Lesson complete!' },
    ],
  },
  {
    icon: RepeatIcon,
    title: 'Spaced Review',
    subtitle: 'Completed lessons come back for review on a schedule — so you never forget what you\'ve learned.',
  },
  {
    icon: StartIcon,
    title: 'Ready?',
    subtitle: 'Pick your first surah and start memorizing.',
  },
];

export default function OnboardingOverlay() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const touchStartX = useRef(0);

  useEffect(() => {
    if (!localStorage.getItem('onboarding-complete')) {
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem('onboarding-complete', 'true');
    setVisible(false);
  };

  const next = () => {
    if (step < CARDS.length - 1) setStep(step + 1);
    else dismiss();
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
  };

  if (!visible) return null;

  const card = CARDS[step];
  const isLast = step === CARDS.length - 1;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-cream">
      {/* Skip button */}
      <div className="flex justify-end px-4 pt-4">
        <button
          onClick={dismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted hover:text-foreground"
        >
          Skip
        </button>
      </div>

      {/* Card content */}
      <div
        className="flex flex-1 flex-col items-center justify-center px-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="w-full max-w-sm text-center">
          <div className="flex justify-center"><card.icon /></div>

          <h2 className="mt-6 text-2xl font-bold text-teal">{card.title}</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">{card.subtitle}</p>

          {/* Phase list for card 2 */}
          {card.phases && (
            <div className="mt-5 space-y-2">
              {card.phases.map((phase, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-card px-4 py-2.5 text-left">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal/10 text-xs font-bold text-teal">
                    {i + 1}
                  </span>
                  <div>
                    <span className="text-sm font-semibold text-foreground">{phase.label}</span>
                    <span className="ml-1.5 text-xs text-muted">— {phase.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom: dots + button */}
      <div className="flex flex-col items-center gap-5 px-8 pb-10">
        {/* Dot indicators */}
        <div className="flex items-center gap-2">
          {CARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-6 bg-teal' : 'w-2 bg-foreground/15'
              }`}
            />
          ))}
        </div>

        <button
          onClick={next}
          className="w-full max-w-sm rounded-xl bg-teal py-3.5 text-sm font-semibold text-white"
        >
          {isLast ? 'Start Learning' : 'Next'}
        </button>
      </div>
    </div>
  );
}
