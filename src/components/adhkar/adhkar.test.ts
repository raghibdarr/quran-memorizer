import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADHKAR_SETS, SET_IDS, isSetId, labelEnglish, nowHref, setsForNow, stepsFor } from './sets';
import { DECK_ORDER, orderDeck } from './deck-order';
import { withoutRepeatedCite } from './source-line';
import { DEFAULT_REMINDERS, EVENING_REMINDER_ID, MORNING_REMINDER_ID, parseReminders, planAdhkarReminders } from './reminders';
import type { EmittedDeck, TextItem } from '@/types/deen';

const items = (id: string) => (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'deen', `${id}.json`), 'utf8')) as EmittedDeck).items as TextItem[];

describe('Pray it now: which set fits', () => {
  it('after the prayer that has entered, with the morning set from Fajr to sunrise and the evening set from Asr to Maghrib', () => {
    expect(setsForNow(null, 'dhuhr')).toEqual([{ set: 'after-prayer', label: 'After Dhuhr adhkar' }]);
    expect(setsForNow(null, 'isha')[0].label).toBe('After Isha adhkar');
    // After Fajr and after Asr both fit: the prayer's own adhkar come first
    expect(setsForNow('morning', 'fajr')).toEqual([
      { set: 'after-prayer', label: 'After Fajr adhkar' },
      { set: 'morning', label: 'Morning adhkar' },
    ]);
    expect(setsForNow('evening', 'asr').map((c) => c.set)).toEqual(['after-prayer', 'evening']);
    expect(setsForNow(null, null)).toEqual([]);
  });

  it('sunrise is a time, not a prayer: nothing is offered after it', () => {
    expect(setsForNow(null, 'sunrise' as never)).toEqual([]);
    // A window with no prayer entered (a high-latitude day with a missing time) still offers its set
    expect(setsForNow('morning', null)).toEqual([{ set: 'morning', label: 'Morning adhkar' }]);
  });

  it('knows its set ids and links', () => {
    expect(SET_IDS.every(isSetId)).toBe(true);
    expect(isSetId('noon')).toBe(false);
    expect(isSetId(null)).toBe(false);
    expect(nowHref('sleep')).toBe('/adhkar/now?set=sleep');
  });
});

describe('Pray it now: the steps of each set', () => {
  for (const id of SET_IDS) {
    it(`every item in the ${id} set ships in its deck`, () => {
      const set = ADHKAR_SETS[id];
      const shipped = items(set.deck);
      const missing = set.items.filter((i) => !shipped.some((s) => s.id === i));
      expect(missing).toEqual([]);
      const leadIns = Object.values(set.leadIns ?? {}).reduce((n, l) => n + l.length, 0);
      expect(stepsFor(set, shipped)).toHaveLength(set.items.length + leadIns);
    });
  }

  it('uses the evening wording in the evening and the morning opening in the morning', () => {
    const me = items('adhkar-morning-evening');
    const evening = stepsFor(ADHKAR_SETS.evening, me);
    const bika = evening.find((s) => s.item.id === 'bika-asbahna')!;
    expect(bika.arabic).toBe(bika.item.variants![0].arabic);
    expect(bika.variantLabel).toMatch(/evening/i);
    expect(bika.title).toBe('By You we enter the evening');
    // Its English is shown as a translation, from inside the label
    expect(bika.english).toMatch(/^O Allah, by You we enter the evening/);
    const morning = stepsFor(ADHKAR_SETS.morning, me);
    const mulk = morning.find((s) => s.item.id === 'al-mulku-lillah')!;
    expect(mulk.arabic).toBe(mulk.item.arabic);
    expect(mulk.opening).toBe(mulk.item.variants![0].arabic);
    expect(mulk.title).toBe('We have reached the morning');
    // The opening stands in for the same number of words, in Arabic, English and transliteration
    expect(`${mulk.openingReplaces} ${mulk.arabicRest}`).toBe(mulk.item.arabic);
    expect(mulk.openingReplaces).toBe('أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ،');
    expect(mulk.englishRest).toMatch(/^and all praise is for Allah/);
    expect(mulk.openingEnglish).toMatch(/^We have reached the morning/);
    expect(mulk.translitRest).toMatch(/^wal-hamdu lillaah/);
    expect(mulk.translitOpening).toMatch(/^Asbahnaa/);
    // The evening set shows it as stored, under its own title
    expect(evening.find((s) => s.item.id === 'al-mulku-lillah')!.title).toBe(mulk.item.title);
    // Morning shows the stored morning wording untouched
    expect(morning.find((s) => s.item.id === 'bika-asbahna')!.arabic).toBe(bika.item.arabic);
  });

  it('counts repeats from the item, and Quran steps carry no Arabic of their own', () => {
    const steps = stepsFor(ADHKAR_SETS.morning, items('adhkar-morning-evening'));
    expect(steps.find((s) => s.item.id === 'subhanallah-wa-bihamdihi')!.repeat).toBe(100);
    const ikhlas = steps.find((s) => s.item.id === 'ikhlas')!;
    expect(ikhlas.repeat).toBe(3);
    expect(ikhlas.arabic).toBeUndefined();
    expect(steps.find((s) => s.item.id === 'sayyid-al-istighfar')!.repeat).toBe(1);
  });

  it('says the thirty-three of each before completing the hundred, with its citation', () => {
    const steps = stepsFor(ADHKAR_SETS['after-prayer'], items('adhkar-after-prayer'));
    const at = steps.findIndex((s) => s.item.id === 'tamam-al-mia');
    expect(steps.slice(at - 3, at).map((s) => [s.title, s.repeat])).toEqual([
      ['SubhanAllah', 33],
      ['Alhamdulillah', 33],
      ['Allahu akbar', 33],
    ]);
    for (const s of steps.slice(at - 3, at)) expect(s.item.citations).toEqual(steps[at].item.citations);
    // The words are the Essentials tasbih items' checked text
    const ess = (JSON.parse(readFileSync(join(process.cwd(), 'src', 'data', 'essentials.json'), 'utf8')) as { items: { id: string; arabic: string; translation: string }[] }[]).flatMap((c) => c.items);
    const byId = (id: string) => ess.find((e) => e.id === id)!;
    const lead = ADHKAR_SETS['after-prayer'].leadIns!['tamam-al-mia'];
    expect(lead.map((l) => [l.arabic, l.translation])).toEqual(
      ['dhikr-subhanallah', 'dhikr-alhamdulillah', 'dhikr-allahuakbar'].map((id) => [byId(id).arabic, byId(id).translation]),
    );
  });

  it("reads the English out of a replaced wording's label", () => {
    expect(labelEnglish('In the evening: "O Allah, by You."')).toBe('O Allah, by You.');
    expect(labelEnglish('In the morning he said the same, opening with these words.')).toBeUndefined();
  });

  it('skips ids a deck has not shipped', () => {
    const steps = stepsFor({ ...ADHKAR_SETS.sleep, items: ['nope', 'bismika-amutu'] }, items('adhkar-sleep-waking'));
    expect(steps.map((s) => s.item.id)).toEqual(['bismika-amutu']);
  });
});

describe('Deck order', () => {
  for (const [deck, groups] of Object.entries(DECK_ORDER)) {
    it(`${deck} lists every shipped item once, in its set order`, () => {
      const shipped = items(deck);
      const listed = orderDeck(deck, shipped).flatMap((g) => g.items.map((i) => i.id));
      expect([...listed].sort()).toEqual(shipped.map((i) => i.id).sort());
      // Every id the order names is shipped, so a typo cannot hide an item at the end
      expect(groups.flatMap((g) => g.ids).filter((id) => !shipped.some((s) => s.id === id))).toEqual([]);
    });
  }

  it('follows the after-prayer set and the order of the prayer', () => {
    const ap = orderDeck('adhkar-after-prayer', items('adhkar-after-prayer'))[0].items.map((i) => i.id);
    expect(ap).toEqual([...ADHKAR_SETS['after-prayer'].items]);
    const salah = orderDeck('salah-words', items('salah-words'))[0].items.map((i) => i.id);
    expect(salah.indexOf('ruku')).toBeLessThan(salah.indexOf('sujud'));
    expect(salah.at(-1)).toBe('qunut-al-witr');
  });

  it('puts an unlisted item at the end rather than dropping it', () => {
    const extra = { ...items('salah-words')[0], id: 'zz-new' };
    const out = orderDeck('salah-words', [...items('salah-words'), extra]);
    expect(out.at(-1)!.items.at(-1)!.id).toBe('zz-new');
    expect(orderDeck('unknown', [extra])).toEqual([{ items: [extra] }]);
  });
});

describe('Evidence lines', () => {
  it('drop a parenthesis that only repeats the citation above', () => {
    const c = [{ collection: 'muslim', number: '2726', numbering: 'abd-al-baqi' }];
    expect(withoutRepeatedCite('He said it (Muslim 2726).', c)).toBe('He said it.');
    expect(withoutRepeatedCite("He said it (Muslim 2723, the narration of Za'idah).", c)).toBe("He said it (Muslim 2723, the narration of Za'idah).");
    expect(withoutRepeatedCite('Al-Tirmidhi relates it (3391).', c)).toBe('Al-Tirmidhi relates it (3391).');
    expect(withoutRepeatedCite('Also in (Abu Dawud 5068).', c)).toBe('Also in (Abu Dawud 5068).');
  });
});

describe('Morning and evening reminders', () => {
  it('are off by default and schedule nothing', () => {
    expect(parseReminders(null)).toEqual(DEFAULT_REMINDERS);
    expect(planAdhkarReminders(DEFAULT_REMINDERS)).toEqual([]);
  });

  it('repeat daily at the chosen time, with the reserved ids', () => {
    const plan = planAdhkarReminders({ morning: { on: true, time: '06:05' }, evening: { on: true, time: '18:40' } });
    expect(plan.map((n) => n.id)).toEqual([MORNING_REMINDER_ID, EVENING_REMINDER_ID]);
    expect([MORNING_REMINDER_ID, EVENING_REMINDER_ID]).toEqual([22000, 22001]);
    expect(plan[0].schedule?.on).toEqual({ hour: 6, minute: 5 });
    expect(plan[1].schedule?.on).toEqual({ hour: 18, minute: 40 });
    expect(plan[0].extra).toEqual({ url: '/adhkar/now?set=morning' });
  });

  it('cleans bad stored values', () => {
    expect(parseReminders('{"morning":{"on":"yes","time":"25:00"}}')).toEqual(DEFAULT_REMINDERS);
    expect(parseReminders('not json')).toEqual(DEFAULT_REMINDERS);
  });
});

describe('Shipped adhkar content', () => {
  const all = ['adhkar-morning-evening', 'adhkar-after-prayer', 'adhkar-sleep-waking', 'duas-daily', 'salah-words'].flatMap(items);

  it('has no bare-name source: every citation is numbered with its scheme', () => {
    for (const it of all) for (const c of it.citations) expect(c.number && c.numbering, `${it.deck}/${it.id}`).toBeTruthy();
  });

  it('gives the iftar dua with the mursal variant attributed', () => {
    const iftar = items('duas-daily').find((i) => i.id === 'iftar')!;
    expect(iftar.variants?.[0].label).toMatch(/Mursal/);
    expect(iftar.variants?.[0].label).toMatch(/al-Nawawi/i);
  });
});
