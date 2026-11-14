// Glossary search (the /glossary page): Latin queries ignore case, accents and
// apostrophes; Arabic queries match the term's consonantal skeleton.

import { arabicSkeleton } from '@/lib/deen/normalize-arabic';
import type { GlossaryTerm } from '@/types/deen';

/** Folds case, accents and apostrophes so "da'if", "da’if" and "daif" all match */
export function foldLatin(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’'ʿʾ`-]/g, '').toLowerCase();
}

export function matchesTerm(t: GlossaryTerm, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (/[\u0600-\u06ff]/.test(q)) return arabicSkeleton(t.arabic).includes(arabicSkeleton(q));
  const f = foldLatin(q);
  return [t.translit, t.id, t.short, t.long ?? ''].some((s) => foldLatin(s).includes(f));
}
