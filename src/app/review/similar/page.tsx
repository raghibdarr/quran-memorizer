'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ayah, SurahMeta } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { realWords } from '@/lib/segments';
import { answers, pickPairs, shuffle, type QuizPair, type TwinMap } from '@/lib/similar-quiz';
import { useReviewStore } from '@/stores/review-store';
import { haptic } from '@/lib/haptics';
import { cn } from '@/lib/cn';
import CloseButton from '@/components/ui/close-button';
import Button from '@/components/ui/button';
import Link from '@/components/app-link';

const SESSION = 8;

type Loaded = { ayah: Ayah; twin: Ayah; options: string[]; right: string };

function Words({ ayah, marked, blank }: { ayah: Ayah; marked: number[]; blank?: boolean }) {
  return (
    <p dir="rtl" className="arabic-text flex flex-wrap justify-center gap-x-2 gap-y-1 text-center text-3xl leading-loose">
      {realWords(ayah).map((w, i) => {
        const hit = marked.includes(i);
        return (
          <span key={w.position} className={cn('rounded-md px-0.5', hit && (blank ? 'min-w-[3.5rem] bg-foreground/10 text-transparent' : 'bg-gold/30 underline decoration-gold-deep decoration-2 underline-offset-[10px]'))}>
            {hit && blank ? ' ' : w.textUthmani}
          </span>
        );
      })}
    </p>
  );
}

/**
 * Similar-ayah practice (roadmap #09): for ayahs you've memorised that have a
 * near-twin elsewhere, pick which wording belongs. Then see both, differences
 * marked: the place memorisers slip from one into the other.
 */
export default function SimilarPractice() {
  const cards = useReviewStore((s) => s.cards);
  const [twins, setTwins] = useState<TwinMap | null>(null);
  const [names, setNames] = useState<Map<number, SurahMeta>>(new Map());
  const [seed, setSeed] = useState(() => Math.floor(Date.now() / 86_400_000));
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [q, setQ] = useState<Loaded | null>(null);

  useEffect(() => {
    import('@/data/mutashabihat.json').then((m) => setTwins((m.default ?? m) as unknown as TwinMap));
    getSurahIndex().then((idx) => setNames(new Map(idx.map((s) => [s.id, s]))));
  }, []);

  const known = useMemo(() => new Set(cards.map((c) => `${c.surahId}:${c.ayahNumber}`)), [cards]);
  const pairs: QuizPair[] = useMemo(() => (twins ? pickPairs(twins, (k) => known.has(k), SESSION, seed) : []), [twins, known, seed]);
  const pair = pairs[i];

  useEffect(() => {
    if (!pair) return;
    let live = true;
    const [s, a] = pair.key.split(':').map(Number);
    const [ts, ta] = pair.twin.split(':').map(Number);
    Promise.all([getSurah(s), getSurah(ts)]).then(([x, y]) => {
      if (!live) return;
      const ayah = x.ayahs[a - 1];
      const twin = y.ayahs[ta - 1];
      const ans = answers(pair, realWords(ayah).map((w) => w.textUthmani), realWords(twin).map((w) => w.textUthmani));
      if (!ans) { setI((n) => n + 1); return; }
      setQ({ ayah, twin, right: ans.right, options: shuffle([ans.right, ans.wrong], seed + i) });
    });
    return () => { live = false; };
  }, [pair, seed, i]);

  const name = (key: string) => {
    const [s, a] = key.split(':').map(Number);
    return `${names.get(s)?.nameSimple ?? `Surah ${s}`} ${s}:${a}`;
  };
  const pick = (o: string) => {
    if (picked || !q) return;
    setPicked(o);
    if (o === q.right) { setScore((n) => n + 1); haptic.success(); } else haptic.selection();
  };
  const next = () => { setPicked(null); setQ(null); setI((n) => n + 1); };
  const again = () => { setSeed((s) => s + 101); setI(0); setScore(0); setPicked(null); setQ(null); };

  const done = twins && pairs.length > 0 && i >= pairs.length;

  return (
    <div className="min-h-dvh bg-cream">
      <div className="sticky top-[var(--safe-top)] z-20 border-b border-foreground/5 bg-cream/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <CloseButton fallback="/review" label="Close practice" />
          <span className="text-sm font-semibold text-teal">Similar ayahs</span>
          <span className="w-11 text-right text-xs tabular-nums text-muted">{pairs.length > 0 && !done ? `${Math.min(i + 1, pairs.length)}/${pairs.length}` : ''}</span>
        </div>
      </div>
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 pb-[var(--tabbar-clearance)]">
        {twins && pairs.length === 0 ? (
          <div className="rounded-2xl bg-card p-6 text-center">
            <p className="font-semibold text-foreground">Nothing to practise yet</p>
            <p className="mt-1 text-sm text-muted">None of the ayahs you&apos;ve memorised has a near-twin elsewhere so far. This fills up as you learn more.</p>
            <Link href="/review" className="mt-4 inline-block text-sm font-semibold text-teal">Back to Review</Link>
          </div>
        ) : done ? (
          <div className="rounded-2xl bg-card p-6 text-center" data-similar-done>
            <p className="text-2xl font-bold text-foreground">{score} of {pairs.length}</p>
            <p className="mt-1 text-sm text-muted">{score === pairs.length ? 'You told every pair apart.' : 'The ones you mixed up are worth a careful look in your next review.'}</p>
            <div className="mt-5 space-y-2">
              <Button className="w-full" onClick={again}>Practise another set</Button>
              <Link href="/review" className="block min-h-11 py-3 text-sm font-semibold text-muted">Back to Review</Link>
            </div>
          </div>
        ) : !q || !pair ? (
          <div className="h-64 animate-pulse rounded-2xl bg-foreground/5" />
        ) : (
          <>
            <div className="rounded-2xl bg-card p-5" data-similar-question={pair.key}>
              <p className="text-center text-xs font-semibold text-teal">{name(pair.key)}</p>
              <p className="mt-1 text-center text-xs text-muted">Which wording belongs in the gap?</p>
              <div className="mt-3">
                <Words ayah={q.ayah} marked={pair.blanks} blank={!picked} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {q.options.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => pick(o)}
                  disabled={!!picked}
                  className={cn(
                    'tactile-chip arabic-text min-h-14 rounded-xl px-4 text-center text-2xl',
                    !picked && 'bg-card',
                    picked && o === q.right && 'bg-success/15 text-success',
                    picked && o === picked && o !== q.right && 'bg-miss/15 text-miss',
                    picked && o !== picked && o !== q.right && 'bg-card opacity-60',
                  )}
                  data-option
                >
                  {o}
                </button>
              ))}
            </div>
            {picked && (
              <div className="space-y-3 rounded-2xl bg-card p-5">
                <p className={cn('text-center text-sm font-semibold', picked === q.right ? 'text-success' : 'text-miss')}>
                  {picked === q.right ? 'Right.' : `That's the wording of ${name(pair.twin)}.`}
                </p>
                <div>
                  <p className="text-center text-xs text-muted">{name(pair.key)}</p>
                  <Words ayah={q.ayah} marked={pair.blanks} />
                </div>
                <div>
                  <p className="text-center text-xs text-muted">{name(pair.twin)}</p>
                  <Words ayah={q.twin} marked={pair.twinWords} />
                </div>
                <Button className="w-full" onClick={next}>{i + 1 < pairs.length ? 'Next' : 'See how you did'}</Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
