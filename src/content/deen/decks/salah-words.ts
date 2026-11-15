import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck } from '@/types/deen';

// Emitted by `node scripts/build-deen.mjs --deck salah-words` from content/deen/adhkar (package adhkar-duas)
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/salah-words.json')).default as unknown as EmittedDeck,
};
export default deck;
