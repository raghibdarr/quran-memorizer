import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/course-fixture.json';
import type { EmittedDeck, Lesson, School } from '@/types/deen';
import {
  continuePoint,
  courseLessonHref,
  courseReview,
  findLesson,
  nextInUnit,
  sortLessons,
  unitFrom,
  unitProgress,
  type CourseUnit,
} from './progress';
import {
  addCardsLabel,
  alsoHeld,
  capitalise,
  cardsToAdd,
  clampStep,
  claimCardsFor,
  claimForCheck,
  evidenceHostDeck,
  evidenceKind,
  consensusChipKind,
  groupEvidence,
  isCorrect,
  lessonCardIdsFor,
  optionLabels,
  lessonSteps,
  parseItemRef,
  quranLabel,
  shouldAskSchool,
} from './lesson';
import { cardsForItem } from '@/lib/deen/cards';

const deck = fixture as unknown as EmittedDeck;
const unit = unitFrom({ id: '_course', title: 'Fixture unit', blurb: 'Test lessons' }, deck)!;
const [first, second] = unit.lessons;

function lesson(id: string, order: number, review: Lesson['review'] = { status: 'source-checked' }): Lesson {
  return { id, unit: 'u', order, rev: 1, title: id, intro: '', claims: [], check: [], review };
}
const mkUnit = (deckId: string, ids: string[]): CourseUnit => ({ deck: deckId, title: deckId, blurb: '', lessons: ids.map((id, i) => lesson(id, i + 1)) });

describe('lesson order and lookup', () => {
  it('orders lessons by `order`, not by id or file order', () => {
    expect(unit.lessons.map((l) => l.id)).toEqual(['fx-01', 'fx-02']);
    expect(sortLessons([lesson('b', 2), lesson('a', 3), lesson('c', 1)]).map((l) => l.id)).toEqual(['c', 'b', 'a']);
  });

  it('a deck with no lessons is not a unit', () => {
    expect(unitFrom({ id: 'x', title: '', blurb: '' }, null)).toBeNull();
    expect(unitFrom({ id: 'x', title: '', blurb: '' }, { deck: 'x', kind: 'course', hash: '', items: [] })).toBeNull();
  });

  it('finds a lesson across units, and the next one in its unit', () => {
    const units = [mkUnit('a', ['a1', 'a2']), mkUnit('b', ['b1'])];
    expect(findLesson(units, 'b1')?.unit.deck).toBe('b');
    expect(findLesson(units, 'a2')?.index).toBe(1);
    expect(findLesson(units, 'nope')).toBeNull();
    expect(nextInUnit(units[0], 'a1')?.id).toBe('a2');
    expect(nextInUnit(units[0], 'a2')).toBeNull();
  });

  it('builds the lesson href with the id encoded', () => {
    expect(courseLessonHref('water-01')).toBe('/course/lesson?l=water-01');
    expect(courseLessonHref('a b')).toBe('/course/lesson?l=a%20b');
  });
});

describe('progress', () => {
  const units = [mkUnit('a', ['a1', 'a2', 'a3']), mkUnit('b', ['b1', 'b2'])];

  it('counts finished lessons per unit', () => {
    expect(unitProgress(units[0], {})).toEqual({ done: 0, total: 3 });
    expect(unitProgress(units[0], { a1: 1, a3: 2, b1: 3 })).toEqual({ done: 2, total: 3 });
  });

  it('starts at the first lesson when nothing is done', () => {
    const p = continuePoint(units, {});
    expect(p?.lesson.id).toBe('a1');
    expect(p?.started).toBe(false);
  });

  it('continues after the lesson finished most recently, in its unit', () => {
    expect(continuePoint(units, { a1: 10 })?.lesson.id).toBe('a2');
    // b1 was finished last: carry on in unit b even though unit a has gaps
    expect(continuePoint(units, { a1: 10, b1: 20 })?.lesson.id).toBe('b2');
    expect(continuePoint(units, { a1: 10, b1: 20 })?.started).toBe(true);
  });

  it('wraps to an earlier gap in the unit, then to any unit', () => {
    // Lessons can be done in any order: a3 last, a2 still open
    expect(continuePoint(units, { a1: 1, a3: 5 })?.lesson.id).toBe('a2');
    // Unit a finished: go to unit b
    expect(continuePoint(units, { a1: 1, a2: 2, a3: 3 })?.lesson.id).toBe('b1');
  });

  it('is null when every lesson is done, or there are no lessons', () => {
    expect(continuePoint(units, { a1: 1, a2: 1, a3: 1, b1: 1, b2: 1 })).toBeNull();
    expect(continuePoint([], {})).toBeNull();
  });
});

describe('course status', () => {
  it('is the honest default until every lesson names a reviewer', () => {
    expect(courseReview([unit])).toEqual({ status: 'source-checked' });
    expect(courseReview([])).toEqual({ status: 'source-checked' });
    const half: CourseUnit = { ...unit, lessons: [lesson('x', 1, { status: 'scholar-reviewed', by: ['r1'] }), lesson('y', 2)] };
    expect(courseReview([half]).status).toBe('source-checked');
    // "scholar-reviewed" without a named reviewer doesn't count
    const anon: CourseUnit = { ...unit, lessons: [lesson('x', 1, { status: 'scholar-reviewed' })] };
    expect(courseReview([anon]).status).toBe('source-checked');
  });

  it('names the reviewers once every lesson has one', () => {
    const all: CourseUnit = {
      ...unit,
      lessons: [lesson('x', 1, { status: 'scholar-reviewed', by: ['r1'] }), lesson('y', 2, { status: 'scholar-reviewed', by: ['r1', 'r2'] })],
    };
    expect(courseReview([all])).toEqual({ status: 'scholar-reviewed', by: ['r1', 'r2'] });
  });
});

describe('lesson steps', () => {
  it('runs intro → each claim → each question → finish', () => {
    expect(lessonSteps(first).map((s) => s.kind)).toEqual(['intro', 'claim', 'claim', 'claim', 'check', 'check', 'finish']);
    expect(lessonSteps(second)).toHaveLength(1 + 1 + 2 + 1);
  });

  it('keeps a restored step inside the lesson', () => {
    expect(clampStep(3, first)).toBe(3);
    expect(clampStep(99, first)).toBe(6);
    expect(clampStep(-2, first)).toBe(0);
    expect(clampStep('2', first)).toBe(0);
    expect(clampStep(1.5, first)).toBe(0);
  });
});

describe('cards for a school choice', () => {
  const differs = first.claims[1];
  const schools: School[] = ['hanafi', 'maliki', 'shafii', 'hanbali'];

  it('without a school: only the cards that belong to no school', () => {
    expect(claimCardsFor(differs, null).map((c) => c.id)).toEqual(['c2a']);
    expect(lessonCardIdsFor('_course', first, null)).toEqual(['_course:fx-01:c1a', '_course:fx-01:c2a', '_course:fx-01:c3a']);
  });

  it.each(schools)('with %s chosen: the general cards plus that school’s card, and no other school’s', (school) => {
    const ids = lessonCardIdsFor('_course', first, school);
    expect(ids).toEqual(['_course:fx-01:c1a', '_course:fx-01:c2a', `_course:fx-01:c2-${school}`, '_course:fx-01:c3a']);
    for (const other of schools.filter((s) => s !== school)) expect(ids).not.toContain(`_course:fx-01:c2-${other}`);
  });

  it('shows the other three schools as "also held" on the chosen card', () => {
    const mine = differs.cards.find((c) => c.school === 'maliki')!;
    expect(alsoHeld(differs, mine).map((c) => c.school)).toEqual(['hanafi', 'shafii', 'hanbali']);
    expect(alsoHeld(differs, differs.cards[0])).toEqual([]);
  });

  it('agrees with the deen engine’s own card choice', () => {
    for (const school of [null, ...schools]) {
      expect(Object.keys(cardsForItem('_course', 'course', first, { depth: 'meaning', school }))).toEqual(lessonCardIdsFor('_course', first, school));
    }
  });

  it('makes new cards at the lesson’s rev, due today, and skips cards already held', () => {
    const now = new Date(2026, 10, 14, 15, 30).getTime();
    const fresh = cardsToAdd('_course', first, 'shafii', {}, now);
    expect(Object.keys(fresh)).toHaveLength(4);
    const card = fresh['_course:fx-01:c2-shafii'];
    expect(card).toMatchObject({ deck: '_course', itemRev: 3, addedAt: now, repetitions: 0, lastReview: 0 });
    expect(card.nextReview).toBeLessThanOrEqual(now);

    const again = cardsToAdd('_course', first, 'shafii', { '_course:fx-01:c1a': {}, '_course:fx-01:c2-shafii': {} }, now);
    expect(Object.keys(again).sort()).toEqual(['_course:fx-01:c2a', '_course:fx-01:c3a']);
  });

  it('labels the button with the count', () => {
    expect(addCardsLabel(1)).toBe('Add 1 card to review');
    expect(addCardsLabel(4)).toBe('Add 4 cards to review');
  });
});

describe('evidence', () => {
  it('names each kind', () => {
    expect(first.claims[0].evidence.map(evidenceKind)).toEqual(['consensus', 'quran']);
    expect(evidenceKind({ item: 'a:b' })).toBe('item');
  });

  it('labels Quran refs, with a range when there is one', () => {
    expect(quranLabel({ surahId: 5, ayah: 6 })).toBe('Quran 5:6');
    expect(quranLabel({ surahId: 2, ayah: 183, ayahEnd: 185 })).toBe('Quran 2:183-185');
    expect(quranLabel({ surahId: 2, ayah: 183, ayahEnd: 183 })).toBe('Quran 2:183');
  });

  it('parses item refs and finds a unit’s own evidence deck', () => {
    expect(parseItemRef('course-fasting-evidence:forgetful-eater')).toEqual({ deck: 'course-fasting-evidence', itemId: 'forgetful-eater' });
    expect(parseItemRef('nawawi40:01')).toEqual({ deck: 'nawawi40', itemId: '01' });
    expect(parseItemRef('nope')).toBeNull();
    expect(parseItemRef('a:b:c')).toBeNull();
    expect(evidenceHostDeck('course-fasting-evidence')).toBe('course-fasting');
    expect(evidenceHostDeck('nawawi40')).toBeNull();
    expect(evidenceHostDeck('-evidence')).toBeNull();
  });

  it('folds places in one work into one chip, keeping authored order', () => {
    const groups = groupEvidence([
      { consensus: { work: 'maratib-al-ijma', location: 'p. 18' } },
      { quran: { surahId: 5, ayah: 6 } },
      { consensus: { work: 'maratib-al-ijma', location: 'p. 19' } },
      { consensus: { work: 'al-ijma', location: 'no. 2' } },
      { item: 'nawawi40:01' },
      { item: 'nawawi40:01' },
      { consensus: { work: 'maratib-al-ijma', location: 'p. 18' } },
    ]);
    expect(groups).toEqual([
      { kind: 'consensus', work: 'maratib-al-ijma', locations: ['p. 18', 'p. 19'] },
      { kind: 'quran', quran: { surahId: 5, ayah: 6 } },
      { kind: 'consensus', work: 'al-ijma', locations: ['no. 2'] },
      { kind: 'item', item: 'nawawi40:01' },
    ]);
  });

  it('calls agreement on a differing claim only the agreed part', () => {
    expect(consensusChipKind('differs')).toBe('Agreed part');
    expect(consensusChipKind('agreed')).toBe('Scholars’ agreement');
  });
});

describe('check questions', () => {
  it('capitalises an option that opens with a term, and nothing else', () => {
    expect(capitalise('tayammum')).toBe('Tayammum');
    expect(capitalise('Fasting')).toBe('Fasting');
    expect(capitalise('  wudu, then prayer')).toBe('  Wudu, then prayer');
    expect(capitalise('“quoted”')).toBe('“quoted”');
    expect(capitalise('3 days')).toBe('3 days');
    expect(capitalise('')).toBe('');
  });

  it('evens out a mixed set of options, and leaves sentence endings alone', () => {
    expect(optionLabels(['tayammum', 'Fasting', 'Giving charity'])).toEqual(['Tayammum', 'Fasting', 'Giving charity']);
    expect(optionLabels(['from sunrise to sunset', 'from dawn to sunset'])).toEqual(['from sunrise to sunset', 'from dawn to sunset']);
    expect(optionLabels(['The head', 'The face'])).toEqual(['The head', 'The face']);
    expect(optionLabels(['“I am fasting.”', 'The same insult back'])).toEqual(['“I am fasting.”', 'The same insult back']);
  });

  it('knows the right answer and the claim it is about', () => {
    const q = first.check[0];
    expect(isCorrect(q, 1)).toBe(true);
    expect(isCorrect(q, 0)).toBe(false);
    expect(claimForCheck(first, q)?.id).toBe('c1');
    expect(claimForCheck(first, { ...q, claim: 'zz' })).toBeNull();
  });
});

describe('the school question', () => {
  it('is asked once, only before any choice or lesson', () => {
    expect(shouldAskSchool(null, false, 0)).toBe(true);
    expect(shouldAskSchool('hanafi', false, 0)).toBe(false);
    expect(shouldAskSchool(null, true, 0)).toBe(false);
    expect(shouldAskSchool(null, false, 2)).toBe(false);
  });
});

describe('the fixture follows the Lesson type and the course brief', () => {
  it('has 2 to 4 check questions per lesson, each pointing at a claim, and four positions where schools differ', () => {
    for (const l of unit.lessons) {
      expect(l.check.length).toBeGreaterThanOrEqual(2);
      expect(l.check.length).toBeLessThanOrEqual(4);
      for (const q of l.check) expect(claimForCheck(l, q)).not.toBeNull();
      for (const c of l.claims) if (c.kind === 'differs') expect(c.positions).toHaveLength(4);
    }
  });
});
