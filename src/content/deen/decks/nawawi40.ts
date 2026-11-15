import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck, GlossaryTerm } from '@/types/deen';

// al-Nawawi's Forty (hadith-nawawi40 package). The items and the package glossary are emitted by
// `node scripts/build-deen.mjs --deck nawawi40` from content/deen/nawawi40; only source-checked
// items are in the emitted file.
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/nawawi40.json')).default as EmittedDeck,
  glossary: async () => (await import('@/data/deen/glossary/nawawi40.json')).default as GlossaryTerm[],
};
export default deck;
