// Build-time param lists for the static export (M11a). Every dynamic route must
// enumerate its params: `output: 'export'` pre-renders each one as a file, and the
// Capacitor shells can only serve what exists on disk. Runs at build time only.

import surahIndex from '@/data/surahs-index.json';
import juzIndex from '@/data/juz-index.json';
import essentials from '@/data/essentials.json';
import type { JuzMeta, SurahMeta } from '@/types/quran';

const surahs = surahIndex as SurahMeta[];
const juz = juzIndex as JuzMeta[];

export function surahIdParams() {
  return surahs.map((s) => ({ surahId: String(s.id) }));
}

export function juzParams() {
  return juz.map((j) => ({ juzNum: String(j.juzNumber) }));
}

export function essentialCollectionParams() {
  return (essentials as Array<{ id: string }>).map((c) => ({ collectionId: c.id }));
}

