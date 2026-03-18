'use client';

import { useSettingsStore } from '@/stores/settings-store';
import type { Ayah } from '@/types/quran';

interface ArabicTextProps {
  ayah: Ayah;
  className?: string;
}

/** Renders ayah Arabic text in the user's chosen script style and font */
export default function ArabicText({ ayah, className = '' }: ArabicTextProps) {
  const arabicScript = useSettingsStore((s) => s.arabicScript);

  if (arabicScript === 'tajweed' && ayah.textUthmaniTajweed) {
    return (
      <div
        className={`arabic-text tajweed-text ${className}`}
        dangerouslySetInnerHTML={{ __html: ayah.textUthmaniTajweed }}
      />
    );
  }

  if (arabicScript === 'indopak' && ayah.textIndopak) {
    return (
      <p className={`arabic-text-indopak ${className}`}>
        {ayah.textIndopak}
      </p>
    );
  }

  return <p className={`arabic-text ${className}`}>{ayah.textUthmani}</p>;
}
