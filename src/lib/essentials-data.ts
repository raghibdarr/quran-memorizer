import type { EssentialCollection, EssentialItem } from '@/types/quran';
import type { Citation, Grading } from '@/types/deen';

/**
 * An Essentials item after the adhkar audit: every item carries numbered
 * citations and attributed gradings, and an item whose words now live in an
 * adhkar deck names it (its text is that item's checked Arabic and our own
 * translation). The base EssentialItem type is shared, so the audit fields are
 * an extension here.
 */
export interface AuditedEssentialItem extends EssentialItem {
  citations?: Citation[];
  gradings?: Grading[];
  /** The deck item holding the same words */
  deen?: { deck: string; item: string };
}

export function auditOf(item: EssentialItem): AuditedEssentialItem {
  return item as AuditedEssentialItem;
}

let cache: EssentialCollection[] | null = null;

export async function getEssentialsIndex(): Promise<EssentialCollection[]> {
  if (cache) return cache;
  const data = (await import('@/data/essentials.json')).default as unknown as EssentialCollection[];
  cache = data;
  return data;
}

export async function getCollection(id: string): Promise<EssentialCollection | undefined> {
  const all = await getEssentialsIndex();
  return all.find((c) => c.id === id);
}
