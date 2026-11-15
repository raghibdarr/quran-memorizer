'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from '@/components/app-link';
import ScreenHeader from '@/components/worship/screen-header';
import Counter from '@/components/worship/counter';
import { ItemArabic } from '@/components/deen/cue-text';
import { RichText } from '@/components/deen/term';
import { CheckIcon } from '@/components/ui/icons';
import { useSettingsStore } from '@/stores/settings-store';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import { ADHKAR_SETS, isSetId, stepsFor, type AdhkarSet, type SetStep } from './sets';
import { QuranRefText, refLabel, useRefAyahs } from './quran-text';
import { repeatText } from './item-card';
import { SourceLine } from './source-line';
import { useAdhkarDeck } from './use-deck';

/** The quiet line a finished set ends on (no score, no streak) */
export const DONE_LINE: Record<string, string> = {
  morning: 'That is the morning adhkar said.',
  evening: 'That is the evening adhkar said.',
  'after-prayer': 'That is the adhkar after the prayer said.',
  sleep: 'That is the bedtime adhkar said.',
};

/** Counts this high get the full tasbih counter; smaller ones a count button beside Next */
const BIG_COUNT = 10;

/**
 * /adhkar/now?set=morning|evening|after-prayer|sleep (spec 2.7, "Pray it now"):
 * walks one set item by item. Items said many times get the tasbih counter, a
 * few times a count button in the bottom bar; the rest a plain "Next". Nothing
 * is rated or recorded, and there is no streak: the place in the set is kept for
 * this session only, so leaving for a moment and coming back resumes it.
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

interface Place {
  index: number;
  counts: number[];
}

const placeKey = (set: string) => `takrar-adhkar-now-${set}`;

/** Where this session left the set (sessionStorage: gone with the tab, never synced) */
function readPlace(set: string, ids: string): Place | null {
  try {
    const raw = sessionStorage.getItem(placeKey(set));
    if (!raw) return null;
    const p = JSON.parse(raw) as { ids?: string; index?: number; counts?: number[] };
    if (p.ids !== ids || typeof p.index !== 'number' || !Array.isArray(p.counts)) return null;
    return { index: p.index, counts: p.counts.map((n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0)) };
  } catch {
    return null;
  }
}

function writePlace(set: string, ids: string, place: Place | null) {
  try {
    if (place) sessionStorage.setItem(placeKey(set), JSON.stringify({ ids, ...place }));
    else sessionStorage.removeItem(placeKey(set));
  } catch {
    // Private mode or storage off: the set simply starts from the top next time
  }
}

function Walk({ set, steps }: { set: AdhkarSet; steps: SetStep[] }) {
  const ids = steps.map((s) => s.item.id).join(',');
  const [place, setPlace] = useState<Place>(() => {
    const saved = readPlace(set.id, ids);
    return saved && saved.index < steps.length && saved.counts.length === steps.length ? saved : { index: 0, counts: steps.map(() => 0) };
  });
  const { index, counts } = place;
  const setIndex = (f: (i: number) => number) => setPlace((p) => ({ ...p, index: f(p.index) }));

  useEffect(() => {
    // A finished set is not kept: coming back starts it fresh
    const fresh = place.index === 0 && place.counts.every((c) => c === 0);
    writePlace(set.id, ids, place.index >= steps.length || fresh ? null : place);
  }, [place, set.id, ids, steps.length]);

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
          <button
            type="button"
            onClick={() => {
              moved.current = true;
              setPlace({ index: 0, counts: steps.map(() => 0) });
            }}
            className="min-h-11 rounded-full px-4 text-sm font-semibold text-muted hover:text-foreground"
          >
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
  const big = step.repeat >= BIG_COUNT;
  const setCount = (n: number) => setPlace((p) => ({ ...p, counts: p.counts.map((v, i) => (i === p.index ? Math.max(0, n) : v)) }));
  const go = (to: number) => {
    moved.current = true;
    setIndex(() => to);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  };
  const next = () => {
    haptic.selection();
    go(index + 1);
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

      {/* Top-aligned under the progress bar, so the text doesn't float between empty bands */}
      <div ref={stepRef} tabIndex={-1} className="outline-none">
        <StepText step={step} roomy={!counted} />
      </div>

      {/* A few repeats: one full-width tap target under the text, its dots inside (a big count gets the tasbih counter) */}
      {counted && !big && <CountPill count={count} target={step.repeat} label={step.title} onCount={() => setCount(Math.min(step.repeat, count + 1))} />}
      {!big && <div className="flex-1" aria-hidden />}

      {big && (
        <div className="mx-auto flex max-h-[21rem] min-h-[17.5rem] w-full max-w-sm flex-1 flex-col">
          <Counter count={count} target={step.repeat} onCount={() => setCount(count + 1)} onUndo={() => setCount(count - 1)} label={step.title} />
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 bg-cream/95 px-4 pt-2 backdrop-blur-sm" style={{ paddingBottom: 'calc(var(--tabbar-clearance) + 0.5rem)' }}>
        <button
          type="button"
          onClick={() => go(Math.max(0, index - 1))}
          disabled={index === 0}
          className="min-h-11 shrink-0 whitespace-nowrap rounded-full px-2 text-sm font-semibold text-muted hover:text-foreground disabled:invisible"
        >
          Previous
        </button>
        <button
          type="button"
          onClick={next}
          className={cn(
            'min-h-12 shrink-0 whitespace-nowrap rounded-full text-sm font-semibold',
            // Until the count is done, moving on is a quiet text link, not a second button of equal weight
            ready ? 'tactile-btn bg-teal px-5 text-on-teal' : 'px-2 text-muted hover:text-foreground',
          )}
          data-now-next
        >
          {last ? 'Finish' : ready ? 'Next' : 'Skip ahead'}
        </button>
      </div>
    </div>
  );
}

/** A few repeats (a surah three times) counted from the bottom bar, so the text stays in view */
function CountPill({ count, target, label, onCount }: { count: number; target: number; label: string; onCount: () => void }) {
  const reached = count >= target;
  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (reached) return;
          if (count + 1 === target) haptic.success();
          else haptic.selection();
          onCount();
        }}
        aria-label={`${label}: ${count} of ${target}. Tap to count.`}
        data-now-count={count}
        data-reached={reached || undefined}
        className={cn(
          'flex min-h-20 w-full select-none flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] px-4 text-base font-semibold tabular-nums touch-manipulation',
          'shadow-[3px_3px_0_var(--shadow-btn-color)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_var(--shadow-btn-color)]',
          'transition-colors motion-reduce:transition-none',
          reached ? 'border-teal/40 bg-teal/10 text-teal' : 'border-[var(--c-ink)] bg-card text-foreground active:bg-foreground/[0.04]',
        )}
      >
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: target }, (_, i) => (
            <span key={i} className={cn('h-2.5 w-2.5 rounded-full', i < count ? 'bg-teal' : 'bg-foreground/15')} />
          ))}
        </span>
        {reached ? <CheckIcon size={16} /> : <span>{count === 0 ? 'Tap to count' : `${count} of ${target}`}</span>}
      </button>
      <span aria-live="polite" className="sr-only">
        {count > 0 ? `${count} of ${target}` : ''}
      </span>
    </>
  );
}

/** Time-of-day labels say nothing inside a set that is already the morning's or the evening's */
const SET_TIME = /^(morning|evening|bedtime|at night)$/i;

function StepText({ step, roomy }: { step: SetStep; roomy: boolean }) {
  const { item } = step;
  const { surahName } = useRefAyahs(item.quran);
  const showTranslit = useSettingsStore((s) => s.transliterationEnabled);
  const repeat = repeatText(step.repeat);
  // An item with another time of day's wording explains it in its own lines below
  const when = item.variants?.length ? [] : (item.usage?.when ?? []).filter((w) => !SET_TIME.test(w.trim()));
  const meta = [item.quran ? refLabel(item.quran, surahName) : null, ...when].filter(Boolean) as string[];
  // A short dhikr with the screen to itself can be larger; a long one stays at the reading size
  const arabicSize = roomy && (step.arabic?.length ?? 0) < 140 ? 'text-[1.75rem]' : 'text-[1.5rem]';
  const split = step.opening && step.openingReplaces && step.arabicRest;
  const english = step.english ?? item.translation;

  return (
    <article className="space-y-3.5 rounded-2xl border border-foreground/10 bg-card p-4">
      <header>
        <h2 className="text-[15px] font-semibold text-foreground">{step.title}</h2>
        {(meta.length > 0 || repeat) && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {meta.length > 0 && <RichText text={meta.join(' · ')} />}
            {repeat && (
              <span className="font-semibold text-foreground/80">
                {meta.length > 0 && ' · '}
                {repeat}
              </span>
            )}
          </p>
        )}
      </header>

      {item.quran ? (
        <QuranRefText quran={item.quran} arabicClass="text-[1.5rem]" />
      ) : split ? (
        // The morning opening, said in place of the evening one the source text starts with
        <>
          <p className="text-xs leading-relaxed text-muted" data-step-variant>
            In the morning, say the words in colour in place of the crossed-out ones.
          </p>
          <p dir="rtl" lang="ar" className={cn('arabic-text px-1 text-balance text-foreground', arabicSize)} style={{ textAlign: 'center' }} data-step-opening>
            <span className="text-teal">{step.opening}</span>{' '}
            <del className="text-[0.8em] text-muted/70 decoration-1">{step.openingReplaces}</del> {step.arabicRest}
          </p>
          {showTranslit && step.translitOpening && (
            <p className="text-center text-sm italic leading-relaxed text-muted">
              <span className="text-teal">{step.translitOpening}</span> <del className="decoration-1 opacity-70">{step.translitReplaces}</del> {step.translitRest}
            </p>
          )}
          {step.openingEnglish ? (
            <p className="max-w-[60ch] text-pretty text-[15px] leading-relaxed text-foreground">
              <span className="font-medium text-teal">{step.openingEnglish}</span> <del className="text-muted decoration-1">{step.englishReplaces}</del> <RichText text={step.englishRest ?? ''} />
            </p>
          ) : (
            item.translation && (
              <p className="max-w-[60ch] text-pretty text-[15px] leading-relaxed text-foreground">
                <RichText text={item.translation} />
              </p>
            )
          )}
          <p className="text-xs leading-relaxed text-muted">The narration gives only this changed opening; the rest is said as it is.</p>
        </>
      ) : (
        <>
          {step.opening && <ItemArabic text={step.opening} className="px-1 text-xl text-teal" />}
          {step.arabic && <ItemArabic text={step.arabic} className={cn('px-1 text-balance', arabicSize)} />}
          {showTranslit && item.transliteration && !step.variantLabel && <p className="text-center text-sm italic leading-relaxed text-muted">{item.transliteration}</p>}
          {english && (!step.variantLabel || step.english || step.opening) ? (
            <p className="max-w-[60ch] text-pretty text-[15px] leading-relaxed text-foreground" data-step-english>
              <RichText text={english} />
            </p>
          ) : (
            step.variantLabel && (
              <p className="text-xs leading-relaxed text-muted" data-step-variant>
                <RichText text={step.variantLabel} />
              </p>
            )
          )}
        </>
      )}
      {/* A Quran step is the Quran itself; its hadith (why it is said) is on the deck card */}
      {!item.quran && item.citations[0] && <SourceLine citation={item.citations[0]} compact className="border-t border-foreground/10 pt-3" />}
    </article>
  );
}
