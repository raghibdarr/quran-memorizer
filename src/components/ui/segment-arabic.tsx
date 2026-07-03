'use client';

import { useMemo } from 'react';
import type { Ayah } from '@/types/quran';
import { useSettingsStore } from '@/stores/settings-store';
import { buildAyahWordData, type AyahSegment, type AyahWordData } from '@/lib/segments';
import ArabicText from './arabic-text';
import { cn } from '@/lib/cn';

interface SegmentArabicProps {
  ayah: Ayah;
  seg: AyahSegment;
  /** precomputed per-word script data — pass when the caller already memoizes it */
  data?: AyahWordData;
  className?: string;
}

/**
 * Arabic for one waqf segment in the user's chosen script. Whole-ayah segments render
 * via ArabicText (full source fidelity); split segments join the per-word script data
 * with count-checked fallback to plain Uthmani (see buildAyahWordData).
 */
export default function SegmentArabic({
  ayah,
  seg,
  data,
  className = 'text-3xl leading-loose',
}: SegmentArabicProps) {
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const wordData = useMemo(() => data ?? buildAyahWordData(ayah), [data, ayah]);

  if (seg.count === 1) {
    return <ArabicText ayah={ayah} className={className} />;
  }
  if (arabicScript === 'tajweed' && wordData.tajweedWords) {
    // The boundary word's tajweed token usually carries its pause mark already
    // (ZWNJ-glued in the source HTML) — only append when it doesn't.
    const html =
      wordData.tajweedWords.slice(seg.wordStart, seg.wordEnd + 1).join(' ') +
      (seg.endMark &&
      !wordData.tajweedWords[seg.wordEnd].replace(/<[^>]+>/g, '').includes(seg.endMark)
        ? ` ${seg.endMark}`
        : '');
    return (
      <div
        className={cn('arabic-text tajweed-text', className)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (arabicScript === 'indopak' && wordData.indopakWords) {
    return (
      <p className={cn('arabic-text-indopak', className)}>
        {wordData.indopakWords.slice(seg.wordStart, seg.wordEnd + 1).join(' ')}
      </p>
    );
  }
  return (
    <p className={cn('arabic-text', className)}>
      {wordData.words.slice(seg.wordStart, seg.wordEnd + 1).map((w) => w.textUthmani).join(' ')}
    </p>
  );
}
