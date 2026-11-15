'use client';

import { Fragment, useEffect, useState } from 'react';
import type { QuranRef } from '@/types/deen';
import type { Ayah } from '@/types/quran';
import { getSurah } from '@/lib/quran-data';
import { useSettingsStore } from '@/stores/settings-store';
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

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const arabicNumber = (n: number) => String(n).replace(/\d/g, (d) => AR_DIGITS[Number(d)]);

/** One ayah inline, in the user's script, ending on its number (the tajweed text carries its own) */
function InlineAyah({ ayah, script }: { ayah: Ayah; script: string }) {
  if (script === 'tajweed' && ayah.textUthmaniTajweed) {
    return <span className="tajweed-text" dangerouslySetInnerHTML={{ __html: `${ayah.textUthmaniTajweed} ` }} />;
  }
  const text = script === 'indopak' && ayah.textIndopak ? ayah.textIndopak : ayah.textUthmani;
  return (
    <span>
      {text} <span className="text-[0.8em] text-muted">۝{arabicNumber(ayah.number)}</span>{' '}
    </span>
  );
}

/**
 * A Quran item's text, rendered from the surah files in the user's script and
 * translation (items never store Quran text of their own, spec 5.1): the ayahs
 * as one centred Arabic passage, each ending on its number, then one English
 * paragraph, the same shape as a hadith item's text. Footnote markers stay in
 * the reader, not here.
 */
export function QuranRefText({ quran, english = true, arabicClass, className }: { quran: QuranRef; english?: boolean; arabicClass?: string; className?: string }) {
  const { ayahs } = useRefAyahs(quran);
  const script = useSettingsStore((s) => s.arabicScript);
  if (!ayahs) return <div className={cn('min-h-24', className)} aria-busy="true" />;
  if (!ayahs.length) return <p className={cn('text-sm text-muted', className)}>These ayahs could not load. They are in the Quran, {quran.surahId}:{quran.ayah}.</p>;
  const indopak = script === 'indopak';
  return (
    <div className={cn('space-y-3.5', className)} data-quran-ref={`${quran.surahId}:${quran.ayah}`}>
      <p
        dir="rtl"
        lang="ar"
        className={cn(indopak ? 'arabic-text-indopak' : 'arabic-text', 'px-1 text-balance text-foreground', arabicClass ?? 'text-[1.5rem]')}
        style={{ textAlign: 'center' }}
      >
        {ayahs.map((a) => (
          <InlineAyah key={a.key} ayah={a} script={script} />
        ))}
      </p>
      {english && (
        <div className="max-w-[60ch] text-pretty text-[15px] leading-relaxed text-foreground [&_[data-footnote]]:hidden [&>div]:inline [&_p]:inline">
          {ayahs.map((a, i) => (
            <Fragment key={a.key}>
              {i > 0 && ' '}
              <TranslationText ayah={a} />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
