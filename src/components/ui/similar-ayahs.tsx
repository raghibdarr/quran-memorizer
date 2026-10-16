'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import type { Ayah, SurahMeta } from '@/types/quran';
import { getSurah, getSurahIndex } from '@/lib/quran-data';
import { realWords } from '@/lib/segments';
import { morphParts } from '@/lib/morph';
import { cn } from '@/lib/cn';
import BottomSheet from './bottom-sheet';
import WordText from './word-text';

/** "2:35" → its near-twins: the twin's key, and the differing word indexes on each side */
type Twin = { k: string; d: number[]; t: number[] };
let data: Promise<Record<string, Twin[]>> | null = null;
const loadData = () => (data ??= import('@/data/mutashabihat.json').then((m) => (m.default ?? m) as Record<string, Twin[]>));

/** An ayah word by word, with the given word indexes marked */
function Marked({ ayah, marked }: { ayah: Ayah; marked: number[] }) {
  return (
    <div dir="rtl" className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-3xl leading-loose">
      {realWords(ayah).map((w, i) => (
        <span key={w.position} className={cn('rounded-md px-0.5', marked.includes(i) && 'bg-gold/30 underline decoration-gold-deep decoration-2 underline-offset-[10px]')}>
          <WordText ayah={ayah} index={i} />
        </span>
      ))}
    </div>
  );
}

/** One side of a differing group: the words stacked in place, faded in or out */
const layer = (on: boolean) => cn(
  '[grid-area:1/1] whitespace-nowrap rounded-md bg-gold/20 px-0.5 text-gold-deep transition-[opacity,transform] duration-500 ease-out motion-reduce:transition-none',
  on ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0',
);

/**
 * The similar-verse morph (roadmap V1): one line that turns from this ayah into its twin.
 * The words they share stay still; only the differing words change, so the eye goes
 * straight to the few places a memoriser slips. Plays once on its own, then on tap.
 */
function Morph({ ayah, twin, d, t, twinLabel }: { ayah: Ayah; twin: Ayah; d: number[]; t: number[]; twinLabel: string }) {
  const parts = useMemo(() => morphParts(realWords(ayah).length, d, realWords(twin).length, t), [ayah, twin, d, t]);
  const [showTwin, setShowTwin] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setShowTwin(true), 1400);
    return () => clearTimeout(id);
  }, []);
  if (!parts) return null;
  const words = (a: Ayah, idx: number[]) => idx.map((i, k) => <Fragment key={i}>{k > 0 && ' '}<WordText ayah={a} index={i} /></Fragment>);
  return (
    <div className="rounded-xl bg-gold/5 p-3" data-similar-morph>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gold-deep" aria-live="polite">{showTwin ? twinLabel : `This ayah · ${ayah.key}`}</p>
        <button
          type="button"
          onClick={() => setShowTwin((v) => !v)}
          className="min-h-9 rounded-full bg-gold/15 px-3 text-xs font-semibold text-gold-deep"
        >
          {showTwin ? 'Back to this ayah' : 'Turn into its twin'}
        </button>
      </div>
      <div dir="rtl" className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-1 text-3xl leading-loose">
        {parts.map((p, k) => p.kind === 'same'
          ? <span key={k}><WordText ayah={ayah} index={p.a} /></span>
          : (
            <span key={k} className="inline-grid">
              <span className={layer(!showTwin)} aria-hidden={showTwin}>{words(ayah, p.a)}</span>
              <span className={layer(showTwin)} aria-hidden={!showTwin}>{words(twin, p.b)}</span>
            </span>
          ))}
      </div>
    </div>
  );
}

/**
 * Mutashabihat (M10): when an ayah has a near-twin elsewhere (computed from the text,
 * scripts/build-mutashabihat.mjs), say so, and compare them with the differing words
 * marked: the classic place memorizers slip from one ayah into the other.
 */
export default function SimilarAyahs({ ayah, className }: { ayah: Ayah; className?: string }) {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{ ayahs: Ayah[]; names: Map<number, SurahMeta> } | null>(null);

  useEffect(() => {
    let live = true;
    loadData().then((d) => live && setTwins(d[ayah.key] ?? []));
    return () => { live = false; };
  }, [ayah.key]);

  useEffect(() => {
    if (!open || loaded || twins.length === 0) return;
    let live = true;
    Promise.all([
      Promise.all(twins.map((t) => { const [s, a] = t.k.split(':').map(Number); return getSurah(s).then((x) => x.ayahs[a - 1]); })),
      getSurahIndex(),
    ]).then(([ayahs, index]) => live && setLoaded({ ayahs, names: new Map(index.map((m) => [m.id, m])) }));
    return () => { live = false; };
  }, [open, loaded, twins]);

  if (twins.length === 0) return null;
  const first = twins[0].k;

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn('mx-auto flex min-h-11 items-center gap-1.5 rounded-full bg-gold/10 px-3.5 text-xs font-semibold text-gold-deep hover:bg-gold/20', className)}
      >
        <span aria-hidden>≈</span>
        Similar to {first}{twins.length > 1 ? ` and ${twins.length - 1} more` : ''} · compare
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="Similar ayahs" doneButton>
        <div className="space-y-4 pb-2">
          <p className="text-sm text-muted">Easy to mix up. Only the marked words change between them.</p>
          {loaded && (
            <Morph
              ayah={ayah}
              twin={loaded.ayahs[0]}
              d={twins[0].d}
              t={twins[0].t}
              twinLabel={`${loaded.names.get(Number(twins[0].k.split(':')[0]))?.nameSimple ?? ''} · ${twins[0].k}`}
            />
          )}
          <div className="rounded-xl bg-teal/5 p-3">
            <p className="mb-1 text-xs font-semibold text-teal">This ayah · {ayah.key}</p>
            <Marked ayah={ayah} marked={twins[0].d} />
          </div>
          {loaded
            ? twins.map((t, i) => {
                const twin = loaded.ayahs[i];
                const name = loaded.names.get(Number(t.k.split(':')[0]))?.nameSimple;
                return (
                  <div key={t.k} className="rounded-xl bg-foreground/[0.04] p-3">
                    <p className="mb-1 text-xs font-semibold text-muted">{name} · {t.k}</p>
                    <Marked ayah={twin} marked={t.t} />
                    {i > 0 && <p className="mt-1 text-[11px] text-muted">This ayah differs from it at other words too.</p>}
                  </div>
                );
              })
            : <p className="text-center text-sm text-muted">Loading…</p>}
        </div>
      </BottomSheet>
    </>
  );
}
