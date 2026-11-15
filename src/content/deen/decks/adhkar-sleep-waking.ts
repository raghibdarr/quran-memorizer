import type { DeckModule } from '@/content/deen/registry';
import type { EmittedDeck } from '@/types/deen';

// Emitted by `node scripts/build-deen.mjs --deck adhkar-sleep-waking` from content/deen/adhkar (package adhkar-duas)
const deck: DeckModule = {
  ready: true,
  load: async () => (await import('@/data/deen/adhkar-sleep-waking.json')).default as unknown as EmittedDeck,
};
export default deck;
