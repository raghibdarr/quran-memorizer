'use client';

import { useEffect, useRef, useState } from 'react';
import type { Ayah } from '@/types/quran';
import { getAyah } from '@/lib/quran-data';
import { playWordsAudio } from '@/lib/word-audio';
import { useSettingsStore } from '@/stores/settings-store';
import { cn } from '@/lib/cn';

/**
 * Tajweed in motion (roadmap V4): in the tap-a-letter explainer, a short example of the
 * rule from the Quran, showing what's written turning into what's recited, played from the
 * reciter's own recording of those words (cut by their word timings).
 */
interface Demo {
  /** The example: ayah and its words, 0-based inclusive */
  key: string;
  from: number;
  to: number;
  /** Transliteration around the changing sound: [before, as written, as recited, after] */
  sound: [string, string, string, string];
  /** Counts the sound is held (a ghunnah's hum, a madd's length) */
  counts?: number;
  /** What to notice, in a sentence */
  note: string;
}

export const TAJWEED_DEMOS: Record<string, Demo> = {
  iqlab: { key: '2:27', from: 4, to: 5, sound: ['mi', 'n', 'm', " ba'di"], counts: 2, note: 'The noon before a baa is said as a meem, with a hum.' },
  idgham_ghunnah: { key: '2:8', from: 2, to: 3, sound: ['ma', 'n ', 'y', 'yaqoolu'], counts: 2, note: 'The noon merges into the yaa that follows, with a hum.' },
  idgham_wo_ghunnah: { key: '2:5', from: 3, to: 4, sound: ['mi', 'n ', 'r', 'rabbihim'], note: 'The noon merges fully into the raa: no hum at all.' },
  ikhafa: { key: '2:4', from: 7, to: 8, sound: ['mi', 'n', '(n)', ' qablika'], counts: 2, note: 'The noon is hidden: the tongue never closes it, only a hum is left.' },
  ikhafa_shafawi: { key: '105:4', from: 0, to: 1, sound: ['tarmeehi', 'm', '(m)', ' bihijaarah'], counts: 2, note: 'The meem before a baa is hidden, lips lightly together, with a hum.' },
  idgham_shafawi: { key: '2:56', from: 1, to: 2, sound: ["ba'athnaaku", 'm ', 'm', 'min'], counts: 2, note: 'A meem with a sukoon merges into the next meem, with a hum.' },
  ghunnah: { key: '2:6', from: 0, to: 0, sound: ['i', 'nn', 'n~n', 'a'], counts: 2, note: 'A doubled noon or meem: hold its hum for two counts.' },
  qalaqah: { key: '112:1', from: 3, to: 3, sound: ['aha', 'd', 'd(ə)', ''], note: 'Stopping on a qalqalah letter, let it bounce with a slight echo.' },
  madda_normal: { key: '1:4', from: 0, to: 0, sound: ['m', 'aa', 'a-a', 'liki'], counts: 2, note: 'A natural madd is held for two counts, no more.' },
  madda_permissible: { key: '1:5', from: 3, to: 3, sound: ["nasta'", 'ee', 'e-e-e-e', 'n'], counts: 4, note: 'Stopping here, the madd may be held 2, 4 or 6 counts.' },
  madda_obligatory: { key: '2:19', from: 3, to: 3, sound: ['as-sam', 'aa', 'a-a-a-a', "'i"], counts: 4, note: 'A madd before a hamzah is held 4 or 5 counts.' },
  madda_necessary: { key: '1:7', from: 8, to: 8, sound: ['ad-d', 'aa', 'a-a-a-a-a-a', 'lleen'], counts: 6, note: 'A madd before a doubled letter is always held six counts.' },
  laam_shamsiyah: { key: '1:1', from: 2, to: 2, sound: ['a', 'l-r', 'r-r', 'ahmaan'], note: 'The laam of al- is silent before a sun letter, which doubles instead.' },
  ham_wasl: { key: '112:1', from: 1, to: 2, sound: ['huwa ', 'a', '', 'llaahu'], note: 'The connecting alif is silent when you carry on from the word before.' },
  slnt: { key: '2:6', from: 2, to: 2, sound: ['kafaroo', '(a)', '', ''], note: 'The final alif is written but never said.' },
};

const COUNT_MS = 380;

export default function TajweedDemo({ rule, color }: { rule: string; color: string }) {
  const demo = TAJWEED_DEMOS[rule];
  const [ayah, setAyah] = useState<Ayah | null>(null);
  const [phase, setPhase] = useState<'written' | 'recited'>('written');
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!demo) return;
    const [s, a] = demo.key.split(':').map(Number);
    let live = true;
    getAyah(s, a).then((x) => live && setAyah(x)).catch(() => {});
    // Show the change once on its own, a moment after opening
    timer.current = setTimeout(() => setPhase('recited'), 900);
    return () => { live = false; if (timer.current) clearTimeout(timer.current); };
  }, [demo]);

  if (!demo) return null;
  const words = ayah?.words.filter((w) => w.charType === 'word').slice(demo.from, demo.to + 1) ?? [];
  const [before, written, recited, after] = demo.sound;

  const hear = async () => {
    if (timer.current) clearTimeout(timer.current);
    setPhase('written');
    setPlaying(true);
    const [s, a] = demo.key.split(':').map(Number);
    const started = playWordsAudio(s, a, demo.from, demo.to, useSettingsStore.getState().reciter);
    timer.current = setTimeout(() => setPhase('recited'), 250);
    await started;
    setTimeout(() => setPlaying(false), (demo.counts ?? 1) * COUNT_MS + 600);
  };

  return (
    <div className="rounded-xl bg-foreground/[0.04] p-3" data-tajweed-demo={rule}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted">For example · {demo.key}</p>
        <button type="button" onClick={() => void hear()} className="min-h-9 rounded-full bg-teal/15 px-3 text-xs font-semibold text-teal" data-hear-demo>
          {playing ? 'Playing…' : 'Hear it'}
        </button>
      </div>
      <p dir="rtl" className="arabic-text mt-1 text-center text-3xl leading-loose">{words.map((w) => w.textUthmani).join(' ')}</p>
      <p className="mt-1 text-center text-lg" aria-label={`Written ${before}${written}${after}, recited ${before}${recited}${after}`}>
        <span>{before}</span>
        <span className="relative inline-grid">
          <span className={cn('[grid-area:1/1] transition-[opacity,transform] duration-500 motion-reduce:transition-none', phase === 'written' ? 'opacity-100' : '-translate-y-2 opacity-0')}>{written}</span>
          <span className={cn('[grid-area:1/1] font-semibold transition-[opacity,transform] duration-500 motion-reduce:transition-none', phase === 'recited' ? 'opacity-100' : 'translate-y-2 opacity-0')} style={{ color }}>{recited}</span>
        </span>
        <span>{after}</span>
      </p>
      {demo.counts && (
        <div className="mx-auto mt-2 flex max-w-[12rem] gap-1" aria-label={`Held ${demo.counts} counts`}>
          {Array.from({ length: demo.counts }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
              <span
                className="block h-full rounded-full transition-[width] ease-linear motion-reduce:transition-none"
                style={{ backgroundColor: color, width: phase === 'recited' ? '100%' : '0%', transitionDuration: `${COUNT_MS}ms`, transitionDelay: phase === 'recited' ? `${i * COUNT_MS}ms` : '0ms' }}
              />
            </span>
          ))}
        </div>
      )}
      <p className="mt-2 text-center text-xs text-muted">{demo.note}</p>
    </div>
  );
}
