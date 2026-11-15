'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/app-link';
import ScreenHeader from '@/components/worship/screen-header';
import Counter from '@/components/worship/counter';
import { ItemArabic } from '@/components/deen/cue-text';
import { RichText } from '@/components/deen/term';
import { CitationLine } from '@/components/deen/citation-line';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { ADHKAR_SETS, isSetId, stepsFor, type AdhkarSet, type SetStep } from './sets';
import { QuranRefText, refLabel, useRefAyahs } from './quran-text';
import { repeatText } from './item-card';
import { useAdhkarDeck } from './use-deck';

/** The quiet line a finished set ends on (no score, no streak) */
export const DONE_LINE: Record<string, string> = {
  morning: 'That is the morning adhkar said.',
  evening: 'That is the evening adhkar said.',
  'after-prayer': 'That is the adhkar after the prayer said.',
  sleep: 'That is the bedtime adhkar said.',
};

/**
 * /adhkar/now?set=morning|evening|after-prayer|sleep (spec 2.7, "Pray it now"):
 * walks one set item by item. Items said more than once get the tasbih counter;
 * the rest a plain "Next". Nothing is rated or recorded, and there is no streak.
 * A full-screen flow (src/lib/nav.ts): no tab bar, the actions sit at the bottom.
 */
export default function AdhkarNowClient() {
  const params = useSearchParams();
  const raw = params.get('set');
  const set = isSetId(raw) ? ADHKAR_SETS[raw] : null;
  const load = useAdhkarDeck(set?.deck ?? null);

  return (
    <div className="flex min-h-dvh flex-col bg-cream" data-adhkar-now={set?.id ?? ''}>
      <ScreenHeader title={set?.title ?? 'Adhkar'} back="/adhkar" />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4">
        {!set || load.status === 'missing' ? (
          <Missing />
        ) : load.status === 'loading' ? (
          <div className="h-64 rounded-2xl border border-foreground/10 bg-card" aria-busy="true" />
        ) : (
          <Walk set={set} steps={stepsFor(set, load.items)} />
        )}
      </main>
    </div>
  );
}

function Missing() {
  return (
    <div className="rounded-2xl border border-foreground/10 bg-card px-5 py-8 text-center">
      <p className="text-sm text-muted">This set isn&rsquo;t here yet.</p>
      <Link href="/adhkar" className="mt-2 inline-flex min-h-11 items-center px-2 text-sm font-semibold text-teal">
        All adhkar and duas
      </Link>
    </div>
  );
}

function Walk({ set, steps }: { set: AdhkarSet; steps: SetStep[] }) {
  const [index, setIndex] = useState(0);
  // Counts per step, so stepping back shows where you were
  const [counts, setCounts] = useState<number[]>(() => steps.map(() => 0));
  // Moving between steps puts focus on the new step's text, so a screen reader
  // reads what is to be said next instead of staying on the button just pressed
  const stepRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) stepRef.current?.focus({ preventScroll: true });
  }, [index]);

  if (!steps.length) return <Missing />;

  if (index >= steps.length) {
    return (
      <section ref={stepRef} tabIndex={-1} className="flex flex-1 flex-col items-center justify-center gap-4 text-center outline-none" style={{ paddingBottom: 'calc(var(--tabbar-clearance) + 4rem)' }} data-now-done>
        <p className="text-base font-semibold text-foreground">{DONE_LINE[set.id]}</p>
        <p className="max-w-xs text-sm leading-relaxed text-muted">May Allah accept it from you.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => { moved.current = true; setIndex(0); setCounts(steps.map(() => 0)); }} className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted hover:text-foreground">
            Say them again
          </button>
          <Link href="/adhkar" className="inline-flex min-h-11 items-center rounded-full bg-teal/10 px-4 text-sm font-semibold text-teal">
            All adhkar
          </Link>
        </div>
      </section>
    );
  }

  const step = steps[index];
  const count = counts[index] ?? 0;
  const counted = step.repeat > 1;
  const setCount = (n: number) => setCounts((c) => c.map((v, i) => (i === index ? Math.max(0, n) : v)));
  const next = () => {
    haptic.selection();
    moved.current = true;
    setIndex((i) => i + 1);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const last = index === steps.length - 1;
  const ready = !counted || count >= step.repeat;

  return (
    <div className="flex flex-1 flex-col gap-4" data-now-step={step.item.id} data-step-index={index}>
      <div className="flex items-center gap-3">
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden>
          <span className="block h-full rounded-full bg-teal transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${(index / steps.length) * 100}%` }} />
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">
          <span className="sr-only">Step </span>
          {index + 1} of {steps.length}
        </span>
      </div>

      <div ref={stepRef} tabIndex={-1} className="outline-none">
        <StepText step={step} />
      </div>

      {counted ? (
        <div className="flex min-h-[13rem] flex-1 flex-col">
          <Counter count={count} target={step.repeat} onCount={() => setCount(count + 1)} onUndo={() => setCount(count - 1)} label={step.title} />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'calc(var(--tabbar-clearance) + 0.5rem)' }}>
        <button
          type="button"
          onClick={() => {
            moved.current = true;
            setIndex((i) => Math.max(0, i - 1));
          }}
          disabled={index === 0}
          className="min-h-11 rounded-full px-3 text-sm font-semibold text-muted hover:text-foreground disabled:opacity-0"
        >
          Back
        </button>
        <button
          type="button"
          onClick={next}
          className={cn(
            'min-h-12 rounded-full px-6 text-sm font-semibold',
            ready ? 'tactile-btn bg-teal text-on-teal' : 'border border-foreground/15 text-foreground',
          )}
          data-now-next
        >
          {last ? 'Finish' : ready ? 'Next' : 'Skip ahead'}
        </button>
      </div>
    </div>
  );
}

function StepText({ step }: { step: SetStep }) {
  const { item } = step;
  const { surahName } = useRefAyahs(item.quran);
  const repeat = repeatText(step.repeat);
  return (
    <article className="space-y-3 rounded-2xl border border-foreground/10 bg-card p-4">
      <header>
        <h2 className="text-[15px] font-semibold text-foreground">{step.title}</h2>
        <p className="mt-0.5 text-xs text-muted">
          {item.quran ? refLabel(item.quran, surahName) : null}
          {item.quran && repeat ? ' · ' : null}
          {repeat}
        </p>
        {/* A step showing another time of day's wording says so in its own line below */}
        {item.usage?.when?.length && !step.variantLabel ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            <RichText text={item.usage.when.join(' · ')} />
          </p>
        ) : null}
        {item.id === 'tamam-al-mia' && (
          <Link href="/tasbih" className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-teal" data-tasbih-link>
            Count the thirty-threes on the tasbih
          </Link>
        )}
      </header>
      {step.variantLabel && (
        <p className="text-xs leading-relaxed text-muted" data-step-variant>
          <RichText text={step.variantLabel} />
        </p>
      )}
      {step.opening && <ItemArabic text={step.opening} className="text-xl text-teal" />}
      {item.quran ? (
        <QuranRefText quran={item.quran} arabicClass="text-[1.5rem]" />
      ) : (
        <>
          {step.arabic && <ItemArabic text={step.arabic} className="text-[1.5rem]" />}
          {/* A replaced wording carries its English in its label; an opening leaves the text, and so its English, as it is */}
          {item.translation && (!step.variantLabel || step.opening) && (
            <p className="text-sm leading-relaxed text-foreground">
              <RichText text={item.translation} />
            </p>
          )}
          {item.citations[0] && <CitationLine citation={item.citations[0]} />}
        </>
      )}
    </article>
  );
}
