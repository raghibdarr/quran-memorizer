import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck, GlossaryTerm } from '@/types/deen';

// The Names of Allah (names99 package). The items and the package glossary are emitted by
// `node scripts/build-deen.mjs --deck names99` from content/deen/names99.
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/names99.json')).default as EmittedDeck,
  glossary: async () => (await import('@/data/deen/glossary/names99.json')).default as GlossaryTerm[],
};
export default deck;
