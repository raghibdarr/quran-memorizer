import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck } from '@/types/deen';

// Emitted by `node scripts/build-deen.mjs --deck adhkar-after-prayer` from content/deen/adhkar (package adhkar-duas)
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/adhkar-after-prayer.json')).default as unknown as EmittedDeck,
};
export default deck;
