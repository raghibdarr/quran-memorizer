import { describe, expect, it } from 'vitest';
import raw from '@/data/zakat-notes.json';
import { ZAKAT_NOTES, zakatNote, type ZakatNoteId } from './notes';

const SCHOOLS = new Set(['hanafi', 'maliki', 'shafii', 'hanbali']);
const IDS: ZakatNoteId[] = ['rate', 'nisab-metals', 'nisab-grams', 'basis', 'combining', 'worn-jewellery', 'debts', 'trade-goods', 'receivables', 'hawl', 'hawl-dip'];

describe('zakat notes (spec 5.1 grounding rules)', () => {
  it('has every note the screen uses, once', () => {
    for (const id of IDS) expect(zakatNote(id).id).toBe(id);
    expect(new Set(ZAKAT_NOTES.map((n) => n.id)).size).toBe(ZAKAT_NOTES.length);
    expect(ZAKAT_NOTES.length).toBe(IDS.length);
  });

  it('every note is structured: text, kind, source lead, status', () => {
    for (const n of ZAKAT_NOTES) {
      expect(n.text.length, n.id).toBeGreaterThan(10);
      expect(['agreed', 'differs']).toContain(n.kind);
      expect(n.sourceLead.length, n.id).toBeGreaterThan(10);
      expect(['draft', 'source-checked', 'scholar-reviewed']).toContain(n.status);
    }
  });

  it('nothing is labelled scholar-reviewed', () => {
    for (const n of ZAKAT_NOTES) expect(n.status, n.id).not.toBe('scholar-reviewed');
  });

  it('draft notes state no hadith numbers or page references', () => {
    for (const n of ZAKAT_NOTES.filter((x) => x.status === 'draft')) {
      expect(n.sourceLead, n.id).not.toMatch(/\d/);
      expect(n.sourceLead, n.id).not.toMatch(/\b(p|pp|vol|no)\.\s/i);
      expect(n.text, n.id).not.toMatch(/\b(hadith|no\.?|number)\s*#?\d/i);
    }
  });

  it('source-checked notes store the Arabic that was located, from two or more works', () => {
    for (const n of ZAKAT_NOTES.filter((x) => x.status === 'source-checked')) {
      expect(n.evidence?.length ?? 0, n.id).toBeGreaterThanOrEqual(2);
      expect(new Set(n.evidence!.map((e) => e.work)).size, n.id).toBeGreaterThanOrEqual(2);
    }
    for (const n of ZAKAT_NOTES) {
      for (const e of n.evidence ?? []) {
        expect(e.work.length, n.id).toBeGreaterThan(5);
        expect(e.place, n.id).not.toMatch(/\d/);
        expect(e.quote, n.id).toMatch(/^[ء-ي\s،؛:.]+$/);
      }
    }
  });

  it('a school position is only stated where its own source was located', () => {
    // Every school named in a source-checked difference has a located quote behind it
    // (the Maliki view on a dip in the year could not be confirmed, so it is not shown)
    const dip = zakatNote('hawl-dip');
    expect(dip.positions!.flatMap((p) => p.school ?? [])).not.toContain('maliki');
    expect(dip.text).toMatch(/Maliki position is not shown/);
  });

  it('the gold nisab is not presented as unanimous', () => {
    expect(zakatNote('nisab-metals').text).toMatch(/In all four schools/);
    expect(zakatNote('nisab-metals').text).toMatch(/set it differently/);
  });

  it('goods for sale are not presented as unanimous; counting receivables is stated as what the calculator does', () => {
    expect(zakatNote('rate').text).toMatch(/In all four schools/);
    expect(zakatNote('rate').text).toMatch(/Zahiri/);
    expect(zakatNote('receivables').text).toMatch(/^This calculator counts/);
  });

  it('positions: two or more, each with who holds it; schools are known', () => {
    for (const n of ZAKAT_NOTES) {
      if (n.kind === 'agreed') {
        expect(n.positions, n.id).toBeUndefined();
        continue;
      }
      if (!n.positions) continue; // a difference named without positions (receivables) defers to a scholar
      expect(n.positions.length, n.id).toBeGreaterThanOrEqual(2);
      for (const p of n.positions) {
        expect(p.by.length).toBeGreaterThan(2);
        expect(p.text.length).toBeGreaterThan(10);
        for (const s of p.school ?? []) expect(SCHOOLS.has(s), `${n.id}: ${s}`).toBe(true);
      }
    }
  });

  it('a difference without positions sends the reader to a scholar', () => {
    for (const n of ZAKAT_NOTES.filter((x) => x.kind === 'differs' && !x.positions)) {
      expect(n.text, n.id).toMatch(/ask a scholar you trust/i);
    }
  });

  it('no invented rulings or banned phrasing', () => {
    const text = JSON.stringify(raw);
    for (const banned of [/you must pay/i, /the correct opinion/i, /the strongest view/i, /scholars agree/i, /\bobligatory on you\b/i]) {
      expect(text).not.toMatch(banned);
    }
  });
});
