import type { DeckModule } from '@/content/deen/registry';

// Stub (foundations). The owning content package replaces this file with
// { ready: true, load: () => import('@/data/deen/salah-words.json') } once items ship.
const deck: DeckModule = { ready: false };
export default deck;
