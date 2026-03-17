'use client';

import { useSettingsStore } from '@/stores/settings-store';
import type { Ayah } from '@/types/quran';

interface ArabicTextProps {
  ayah: Ayah;
  className?: string;
}

/** Renders ayah Arabic text in the user's chosen script style */
export default function ArabicText({ ayah, className = '' }: ArabicTextProps) {
  const arabicScript = useSettingsStore((s) => s.arabicScript);

  const baseClass = `arabic-text ${className}`;

  if (arabicScript === 'tajweed' && ayah.textUthmaniTajweed) {
    return (
      <div
        className={`${baseClass} tajweed-text`}
        dangerouslySetInnerHTML={{ __html: ayah.textUthmaniTajweed }}
      />
    );
  }

  if (arabicScript === 'indopak' && ayah.textIndopak) {
    return <p className={baseClass}>{ayah.textIndopak}</p>;
  }

  return <p className={baseClass}>{ayah.textUthmani}</p>;
}
