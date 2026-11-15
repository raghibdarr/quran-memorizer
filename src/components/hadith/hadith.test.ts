import { describe, expect, it } from 'vitest';
import emitted from '@/data/deen/nawawi40.json';
import glossary from '@/data/deen/glossary/nawawi40.json';
import deckModule from '@/content/deen/decks/nawawi40';
import type { EmittedDeck, TextItem } from '@/types/deen';
import { splitSegments } from '@/components/deen/text';
import { deckProgress, hadithHref, hadithNumber, learnActions, neighbours, normaliseHadithId, progressLine, readingParts } from './hadith-logic';

const deck = emitted as unknown as EmittedDeck;
const items = deck.items as TextItem[];

describe('hadith-logic', () => {
  it('normalises ids to the deck spelling and rejects anything else', () => {
    expect(normaliseHadithId('1')).toBe('01');
    expect(normaliseHadithId('01')).toBe('01');
    expect(normaliseHadithId('42')).toBe('42');
    expect(normaliseHadithId('43')).toBeNull();
    expect(normaliseHadithId('0')).toBeNull();
    expect(normaliseHadithId('1a')).toBeNull();
    expect(normaliseHadithId(null)).toBeNull();
    expect(hadithNumber('07')).toBe(7);
    expect(hadithHref('07')).toBe('/hadith/view?id=07');
  });

  it('counts progress from item states, missing states being new', () => {
    const p = deckProgress([{ id: '01' }, { id: '02' }, { id: '03' }, { id: '04' }], { '01': 'learning', '02': 'strong', '03': 'due' });
    expect(p).toEqual({ started: 3, strong: 1, due: 1, total: 4 });
    expect(progressLine(p)).toBe('3 of 4 started · 1 strong');
    expect(progressLine(deckProgress([{ id: '01' }], {}))).toBe('1 hadith to learn, one at a time.');
  });

  it('finds the hadith either side', () => {
    const list = [{ id: '01' }, { id: '02' }, { id: '03' }];
    expect(neighbours(list, '02')).toEqual({ prev: { id: '01' }, next: { id: '03' } });
    expect(neighbours(list, '01').prev).toBeNull();
    expect(neighbours(list, '09')).toEqual({ prev: null, next: null });
  });

  it('splits the Arabic for reading exactly where the learning parts split', () => {
    for (const it of items) {
      const reading = readingParts(it.arabic!, it.segments);
      expect(reading.join(' ')).toBe(it.arabic!.trim());
      expect(reading).toEqual(splitSegments(it.arabic!, it.segments));
    }
  });
});

describe('learnActions', () => {
  it('keeps "Start memorising" until the recall card exists, and drops the meaning offer once it is learned', () => {
    expect(learnActions([], '01')).toEqual({ memoriseLabel: 'Start memorising', offerMeaning: true });
    expect(learnActions(['nawawi40:01:meaning'], '01')).toEqual({ memoriseLabel: 'Start memorising', offerMeaning: false });
    expect(learnActions(['nawawi40:01:meaning', 'nawawi40:01:narrator', 'nawawi40:01:recall'], '01')).toEqual({
      memoriseLabel: 'Memorise it again',
      offerMeaning: false,
    });
    // another hadith's cards do not count
    expect(learnActions(['nawawi40:02:recall', 'nawawi40:02:meaning'], '01')).toEqual({ memoriseLabel: 'Start memorising', offerMeaning: true });
  });
});

describe('the emitted Forty', () => {
  it('attributes every grading outside the two Sahihs with the scholar’s own words', () => {
    for (const it of items) {
      for (const g of it.gradings) {
        if (g.grade === 'in-sahih') continue;
        expect(g.quote, it.id).toMatch(/[ء-ي]/);
      }
      // al-Tirmidhi's "hasan sahih" is his own term: the line says so, not only "Sahih"
      for (const g of it.gradings.filter((x) => x.quote?.includes('حَسَنٌ صَحِيحٌ'))) expect(g.in, it.id).toMatch(/hasan sahih/);
    }
  });

  it('ships at least hadith 1 to 15, in order, all source-checked', () => {
    const ids = items.map((i) => i.id);
    for (let n = 1; n <= 15; n++) expect(ids).toContain(String(n).padStart(2, '0'));
    expect([...ids].sort()).toEqual(ids);
    for (const it of items) expect(['source-checked', 'scholar-reviewed']).toContain(it.review.status);
    expect(items.some((i) => i.review.status === 'scholar-reviewed')).toBe(false);
  });

  it('cites each hadith by its place in the Forty and by a named collection', () => {
    for (const it of items) {
      const own = it.citations.find((c) => c.collection === 'nawawi40');
      expect(own, it.id).toEqual(expect.objectContaining({ number: String(Number(it.id)), numbering: 'nawawi-order' }));
      expect(it.citations.filter((c) => c.collection !== 'nawawi40').length, it.id).toBeGreaterThan(0);
      for (const g of it.gradings) {
        expect(g.by, it.id).toBeTruthy();
        expect(g.in, it.id).toBeTruthy();
      }
    }
  });

  it('has three witnesses per item, two of them printed commentaries not taken from Sunnah.com', () => {
    for (const it of items) {
      const names = it.provenance!.witnesses.map((w) => w.name);
      expect(names, it.id).toEqual(['ibn-daqiq-sharh', 'haytami-fath-al-mubin', 'hadith-api']);
      for (const w of it.provenance!.witnesses) expect(w.skeletonSha256, `${it.id} ${w.name}`).toMatch(/^[0-9a-f]{64}$/);
      expect(it.provenance!.note, it.id).toMatch(/ﷺ/);
    }
  });

  it('gives every long narration authored segments that end at a sentence end', () => {
    for (const it of items) {
      const words = it.arabic!.split(/\s+/).length;
      if (words > 50) expect(it.segments?.length ?? 0, it.id).toBeGreaterThan(1);
      for (const end of (it.segments ?? []).slice(0, -1)) {
        expect(it.arabic!.slice(0, end), `${it.id} @${end}`).toMatch(/[،.؟:»]$/);
      }
    }
  });

  it('writes the honorifics as one glyph and keeps the Arabic free of Latin and digits', () => {
    for (const it of items) {
      expect(it.arabic, it.id).not.toMatch(/صَ?لَّ?ى اللَّهُ عَلَيْهِ/);
      expect(it.arabic, it.id).not.toMatch(/[A-Za-z0-9٠-٩]/);
    }
  });

  it('is ready, and loads the emitted deck and its glossary', async () => {
    expect(deckModule.ready).toBe(true);
    if (!deckModule.ready) return;
    const loaded = await deckModule.load();
    const d = 'default' in loaded ? loaded.default : loaded;
    expect(d.items.length).toBe(items.length);
    const g = await deckModule.glossary!();
    expect(Array.isArray('default' in g ? g.default : g)).toBe(true);
    expect((glossary as { id: string }[]).map((t) => t.id)).toContain('ihsan');
  });
});
