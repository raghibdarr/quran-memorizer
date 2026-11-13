// Glossary lookup (all-in-one spec 3.3, 5.2): the core terms plus every live
// package's terms. Authored text writes a term as [[term-id]]; the build refuses
// a term that doesn't resolve, and refuses two files defining one id differently.

import type { GlossaryTerm } from '@/types/deen';
import { loadDeckGlossaries } from './load';

export const TERM_MARK = /\[\[([a-z0-9-]+)\]\]/g;

/** Splits authored text into plain runs and term references, for rendering <Term> */
export function splitTerms(text: string): Array<{ text: string } | { term: string }> {
  const out: Array<{ text: string } | { term: string }> = [];
  let last = 0;
  for (const m of text.matchAll(TERM_MARK)) {
    if (m.index! > last) out.push({ text: text.slice(last, m.index) });
    out.push({ term: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** The text with each [[term]] replaced by its transliteration (for plain-text use) */
export function plainText(text: string, terms: ReadonlyMap<string, GlossaryTerm>): string {
  return text.replace(TERM_MARK, (_, id: string) => terms.get(id)?.translit ?? id);
}

/** Merges glossary files into one map; the first definition of an id wins */
export function indexTerms(...files: GlossaryTerm[][]): Map<string, GlossaryTerm> {
  const map = new Map<string, GlossaryTerm>();
  for (const file of files) for (const t of file) if (!map.has(t.id)) map.set(t.id, t);
  return map;
}

let glossary: Promise<Map<string, GlossaryTerm>> | null = null;

/** Every term the app knows: core first, then the live decks' packages */
export function loadGlossary(): Promise<Map<string, GlossaryTerm>> {
  glossary ??= (async () => {
    const core = (await import('@/data/deen/glossary/core.json')).default as GlossaryTerm[];
    return indexTerms(core, ...(await loadDeckGlossaries()));
  })();
  return glossary;
}

export async function lookupTerm(id: string): Promise<GlossaryTerm | null> {
  return (await loadGlossary()).get(id) ?? null;
}

/** Terms sorted for the /glossary page */
export function sortedTerms(terms: ReadonlyMap<string, GlossaryTerm>): GlossaryTerm[] {
  return [...terms.values()].sort((a, b) => a.translit.localeCompare(b.translit, 'en', { sensitivity: 'base' }));
}
