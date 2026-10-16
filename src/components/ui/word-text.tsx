'use client';

import type { Ayah } from '@/types/quran';
import { useSettingsStore } from '@/stores/settings-store';
import { buildAyahWordData, type AyahWordData } from '@/lib/segments';
import { cn } from '@/lib/cn';

// One word list per ayah, however many words of it are on screen
const cache = new WeakMap<Ayah, AyahWordData>();
const wordData = (ayah: Ayah) => {
  let d = cache.get(ayah);
  if (!d) { d = buildAyahWordData(ayah); cache.set(ayah, d); }
  return d;
};

/**
 * One word of an ayah in the user's chosen script: tajweed colours, IndoPak, or
 * Uthmani (also the fallback when a script's word split doesn't line up).
 * `index` is 0-based over the ayah's real words.
 */
export default function WordText({ ayah, index, className }: { ayah: Ayah; index: number; className?: string }) {
  const arabicScript = useSettingsStore((s) => s.arabicScript);
  const { words, tajweedWords, indopakWords } = wordData(ayah);
  if (arabicScript === 'tajweed' && tajweedWords) {
    return <span className={cn('arabic-text tajweed-text', className)} dangerouslySetInnerHTML={{ __html: tajweedWords[index] }} />;
  }
  if (arabicScript === 'indopak' && indopakWords) return <span className={cn('arabic-text-indopak', className)}>{indopakWords[index]}</span>;
  return <span className={cn('arabic-text', className)}>{words[index]?.textUthmani}</span>;
}
