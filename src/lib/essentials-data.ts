import type { EssentialCollection } from '@/types/quran';

let cache: EssentialCollection[] | null = null;

export async function getEssentialsIndex(): Promise<EssentialCollection[]> {
  if (cache) return cache;
  const data = (await import('@/data/essentials.json')).default as EssentialCollection[];
  cache = data;
  return data;
}

export async function getCollection(id: string): Promise<EssentialCollection | undefined> {
  const all = await getEssentialsIndex();
  return all.find((c) => c.id === id);
}
