import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck, GlossaryTerm } from '@/types/deen';

// Foundations course, Unit Purification: nine lessons authored under
// content/deen/course/purification and emitted by scripts/build-deen.mjs.
// (A JSON import widens literal fields to string, hence the casts.)
const deck: DeckModule = {
  ready: true,
  load: () => import('@/data/deen/course-purification.json').then((m) => m.default as unknown as EmittedDeck),
  glossary: () => import('@/data/deen/glossary/course-purification.json').then((m) => m.default as GlossaryTerm[]),
};
export default deck;
