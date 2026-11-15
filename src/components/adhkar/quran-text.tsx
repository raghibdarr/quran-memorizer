'use client';

import { useEffect, useState } from 'react';
import type { QuranRef } from '@/types/deen';
import type { Ayah } from '@/types/quran';
import { getSurah } from '@/lib/quran-data';
import ArabicText from '@/components/ui/arabic-text';
import TranslationText from '@/components/ui/translation-text';
import { cn } from '@/lib/cn';

/** The ayahs a Quran item refers to (null while loading, [] when they cannot load) */
export function useRefAyahs(ref: QuranRef | undefined): { ayahs: Ayah[] | null; surahName: string } {
  const [state, setState] = useState<{ key: string; ayahs: Ayah[] | null; surahName: string }>({ key: '', ayahs: null, surahName: '' });
  const key = ref ? `${ref.surahId}:${ref.ayah}-${ref.ayahEnd ?? ref.ayah}` : '';
  useEffect(() => {
    if (!ref) return;
    let live = true;
    getSurah(ref.surahId)
      .then((s) => {
        if (!live) return;
        const end = ref.ayahEnd ?? ref.ayah;
        setState({ key, ayahs: s.ayahs.filter((a) => a.number >= ref.ayah && a.number <= end), surahName: s.nameSimple });
      })
      .catch(() => live && setState({ key, ayahs: [], surahName: '' }));
    return () => {
      live = false;
    };
    // key stands for ref
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { ayahs: state.ayahs, surahName: state.surahName } : { ayahs: null, surahName: '' };
}

/** "Al-Ikhlas 1-4" */
export function refLabel(ref: QuranRef, surahName: string): string {
  const range = ref.ayahEnd && ref.ayahEnd !== ref.ayah ? `${ref.ayah}-${ref.ayahEnd}` : `${ref.ayah}`;
  return `${surahName || `Surah ${ref.surahId}`} ${range}`;
}

/**
 * A Quran item's text, rendered from the surah files in the user's script and
 * translation (items never store Quran text of their own, spec 5.1)
 */
export function QuranRefText({ quran, english = true, arabicClass, className }: { quran: QuranRef; english?: boolean; arabicClass?: string; className?: string }) {
  const { ayahs } = useRefAyahs(quran);
  if (!ayahs) return <div className={cn('min-h-24', className)} aria-busy="true" />;
  if (!ayahs.length) return <p className={cn('text-sm text-muted', className)}>These ayahs could not load. They are in the Quran, {quran.surahId}:{quran.ayah}.</p>;
  return (
    <div className={cn('space-y-3', className)} data-quran-ref={`${quran.surahId}:${quran.ayah}`}>
      {ayahs.map((a) => (
        <div key={a.key} className="space-y-1.5">
          <ArabicText ayah={a} className={arabicClass ?? 'text-[1.6rem]'} />
          {english && <TranslationText ayah={a} className="text-sm leading-relaxed text-foreground" />}
        </div>
      ))}
    </div>
  );
}
