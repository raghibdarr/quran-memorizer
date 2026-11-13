import type { DeckModule } from '@/content/deen/registry';

// Stub (foundations). The owning content package replaces this file with
// { ready: true, load: () => import('@/data/deen/names99.json') } once items ship.
const deck: DeckModule = { ready: false };
export default deck;
