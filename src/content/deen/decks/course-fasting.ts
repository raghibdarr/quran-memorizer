import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck, GlossaryTerm } from '@/types/deen';

// Unit Fasting (course-fasting package). The lessons and the package glossary are emitted by
// `node scripts/build-deen.mjs --deck course-fasting` from content/deen/course/fasting.
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/course-fasting.json')).default as EmittedDeck,
  glossary: async () => (await import('@/data/deen/glossary/course-fasting.json')).default as GlossaryTerm[],
};
export default deck;
