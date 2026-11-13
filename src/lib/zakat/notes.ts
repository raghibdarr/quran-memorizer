// Typed access to src/data/zakat-notes.json: the zakat screen's explainer
// statements as data (spec 5.1). A note is either agreed between the schools or
// a difference shown as positions, never a ruling of our own.

import raw from '@/data/zakat-notes.json';

export type School = 'hanafi' | 'maliki' | 'shafii' | 'hanbali';

export interface ZakatPosition {
  /** Who holds it: a school ("Hanafi"), schools, or a reckoning ("A dinar of 4.25 g") */
  by: string;
  school?: School[];
  text: string;
}

export interface ZakatNote {
  id: string;
  kind: 'agreed' | 'differs';
  text: string;
  positions?: ZakatPosition[];
  /** Where a checker should look; a lead, not a confirmed citation */
  sourceLead: string;
  /** 'draft' until checked against two sources; shown with the unreviewed line */
  status: 'draft' | 'source-checked' | 'scholar-reviewed';
}

export const ZAKAT_NOTES: readonly ZakatNote[] = (raw as { notes: ZakatNote[] }).notes;

export type ZakatNoteId =
  | 'rate'
  | 'nisab-metals'
  | 'nisab-grams'
  | 'basis'
  | 'combining'
  | 'worn-jewellery'
  | 'debts'
  | 'trade-goods'
  | 'receivables'
  | 'hawl'
  | 'hawl-dip';

export function zakatNote(id: ZakatNoteId): ZakatNote {
  const n = ZAKAT_NOTES.find((x) => x.id === id);
  if (!n) throw new Error(`Missing zakat note ${id}`);
  return n;
}
