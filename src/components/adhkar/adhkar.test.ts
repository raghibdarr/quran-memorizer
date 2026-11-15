import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ADHKAR_SETS, SET_IDS, isSetId, nowHref, setsForNow, stepsFor } from './sets';
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
      expect(stepsFor(set, shipped)).toHaveLength(set.items.length);
    });
  }

  it('uses the evening wording in the evening and the morning opening in the morning', () => {
    const me = items('adhkar-morning-evening');
    const evening = stepsFor(ADHKAR_SETS.evening, me);
    const bika = evening.find((s) => s.item.id === 'bika-asbahna')!;
    expect(bika.arabic).toBe(bika.item.variants![0].arabic);
    expect(bika.variantLabel).toMatch(/evening/i);
    expect(bika.title).toBe('By You we enter the evening');
    const morning = stepsFor(ADHKAR_SETS.morning, me);
    const mulk = morning.find((s) => s.item.id === 'al-mulku-lillah')!;
    expect(mulk.arabic).toBe(mulk.item.arabic);
    expect(mulk.opening).toBe(mulk.item.variants![0].arabic);
    expect(mulk.title).toBe('We have reached the morning');
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

  it('skips ids a deck has not shipped', () => {
    const steps = stepsFor({ ...ADHKAR_SETS.sleep, items: ['nope', 'bismika-amutu'] }, items('adhkar-sleep-waking'));
    expect(steps.map((s) => s.item.id)).toEqual(['bismika-amutu']);
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
