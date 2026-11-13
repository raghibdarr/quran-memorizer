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
