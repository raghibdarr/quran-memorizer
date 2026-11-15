import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// The build script is plain Node (ESM JS); its exports are the guardrails themselves
import * as deen from '../../../scripts/build-deen.mjs'

// The content gate (all-in-one spec 5.5). Part 1 runs the same check as
// `node scripts/build-deen.mjs --check` over every authored deck, so an
// ungrounded item fails `npm run test:run` and with it the Netlify deploy.
// Part 2 proves each of the 15 guardrails fires, on a mutated copy of the
// fixture deck (content/deen/_fixture, test-only, never emitted).

type Item = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Issue = { code: string; deck: string; id: string; msg: string }

describe('authored content passes every guardrail', () => {
  it('build-deen --check is clean', () => {
    const res = deen.checkAll()
    const errors = res.errors.map((e: Issue) => `${e.code} ${e.deck} ${e.id}: ${e.msg}`)
    expect(errors).toEqual([])
  })

  it('every emitted deck file matches its authored items (nothing hand-edited, nothing stale)', () => {
    const res = deen.checkAll()
    for (const [id, r] of Object.entries(res.results) as Array<[string, { emitted: Item[] }]>) {
      let emitted: { items: Item[] } | null = null
      try {
        emitted = JSON.parse(readFileSync(join(deen.ROOT, 'src', 'data', 'deen', `${id}.json`), 'utf8'))
      } catch {
        emitted = null
      }
      if (r.emitted.length === 0 && !emitted) continue
      expect(emitted, `src/data/deen/${id}.json is missing: run node scripts/build-deen.mjs --deck ${id}`).not.toBeNull()
      expect(emitted!.items.map((i) => `${i.id}@${i.rev}`)).toEqual(r.emitted.map((i) => `${i.id}@${i.rev}`))
    }
  })
})

// ---------- the fixture, and a harness to mutate it ----------

const ctx = deen.makeContext(deen.ROOT, { includeFixture: true })
const fixture = deen.readDeck(deen.ROOT, '_fixture')!
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

function run(mutate: (items: Item[], lock: { ids: Record<string, Item> }) => void, opts: { kind?: string; glossary?: Map<string, Item> } = {}) {
  const items = clone(fixture.items) as Array<{ file: string; data: Item }>
  const lock = clone(fixture.lock)
  mutate(items.map((i) => i.data), lock)
  return deen.validateDeck(
    { deck: '_fixture', kind: opts.kind ?? 'hadith', items, lock },
    { ...ctx, glossary: opts.glossary ?? ctx.glossary },
  )
}
const codes = (r: { errors: Issue[] }) => r.errors.map((e) => e.code)

describe('the fixture deck', () => {
  it('passes cleanly, all three items ship', () => {
    const r = run(() => {})
    expect(r.errors).toEqual([])
    expect(r.emitted.map((i: Item) => i.id)).toEqual(['01', '02', '03'])
    expect(r.lockChanged).toBe(false)
  })

  it('emits into a temp dir only, with the review log stripped', () => {
    const out = mkdtempSync(join(tmpdir(), 'deen-test-'))
    try {
      const res = deen.build(deen.ROOT, { decks: ['_fixture'], includeFixture: true, outDir: out, writeLock: false })
      expect(res.errors).toEqual([])
      const emitted = JSON.parse(readFileSync(join(out, '_fixture.json'), 'utf8'))
      expect(emitted.items).toHaveLength(3)
      expect(emitted.items[0].review).toEqual({ status: 'source-checked' })
      expect(emitted.hash).toMatch(/^[0-9a-f]{16}$/)
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})

describe('guardrails, each with a failing fixture', () => {
  it('G1: an item without review fails; a draft is not emitted; scholar-reviewed needs a listed reviewer', () => {
    expect(codes(run((it) => { delete it[0].review }))).toContain('G1')
    const draft = run((it, lock) => { it[2].review.status = 'draft'; delete lock.ids['03'] })
    expect(draft.errors).toEqual([])
    expect(draft.emitted.map((i: Item) => i.id)).toEqual(['01', '02'])
    expect(codes(run((it) => { it[0].review = { status: 'scholar-reviewed', by: ['nobody'] } }))).toContain('G1')
  })

  it('G2: a hadith needs a citation with a known collection, number and numbering', () => {
    expect(codes(run((it) => { it[0].citations = [] }))).toContain('G2')
    expect(codes(run((it) => { it[0].citations[0].collection = 'made-up' }))).toContain('G2')
    expect(codes(run((it) => { it[0].citations[0].number = '' }))).toContain('G2')
    expect(codes(run((it) => { it[0].citations[0].numbering = 'abd-al-baqi' }))).toContain('G2')
  })

  it('G2: a variant wording is cited like the item itself', () => {
    const variant = (citations: Item[]) => run((it) => { it[0].variants = [{ label: 'Another wording', arabic: 'نص آخر للاختبار', citations }]; it[0].rev = 2 })
    expect(variant([{ collection: 'fixture-sahih', number: '3', numbering: 'fixture-numbering' }]).errors).toEqual([])
    expect(codes(variant([]))).toContain('G2')
    expect(codes(variant([{ collection: 'made-up', number: '3', numbering: 'fixture-numbering' }]))).toContain('G2')
    expect(codes(variant([{ collection: 'fixture-sahih', number: '', numbering: 'fixture-numbering' }]))).toContain('G2')
  })

  it('G3: outside the two Sahihs an attributed grading is required', () => {
    expect(codes(run((it) => { it[2].gradings = [] }))).toContain('G3')
    expect(codes(run((it) => { it[2].gradings[0].by = 'someone-unknown' }))).toContain('G3')
    expect(codes(run((it) => { it[2].gradings[0].in = '' }))).toContain('G3')
  })

  it('G3: outside the two Sahihs, an item with no sahih or hasan verdict cannot ship (inclusion rule)', () => {
    expect(codes(run((it) => { it[2].gradings[0].grade = 'daif' }))).toContain('G3')
    expect(codes(run((it) => { it[2].gradings[0].grade = 'mursal' }))).toContain('G3')
    // Where authorities differ both are shown: one sound verdict is enough
    const both = run((it) => { it[2].gradings.push({ grade: 'daif', by: 'fixture-scholar', in: 'Another fixture work' }); it[2].rev = 2 })
    expect(both.errors).toEqual([])
    // A weak narration can sit in the folder as a draft; it is just never emitted
    const draft = run((it, lock) => { it[2].gradings[0].grade = 'daif'; it[2].review.status = 'draft'; delete lock.ids['03'] })
    expect(draft.errors).toEqual([])
    expect(draft.emitted.map((i: Item) => i.id)).toEqual(['01', '02'])
    // In a Sahih collection no grading is needed, and a weak verdict beside it does not block
    expect(codes(run((it) => { it[0].gradings = [{ grade: 'daif', by: 'fixture-scholar', in: 'Fixture work' }]; it[0].rev = 2 }))).not.toContain('G3')
  })

  it('G4: two witnesses, one not from Sunnah.com, hashes that match or a variant note', () => {
    expect(codes(run((it) => { it[0].provenance.witnesses.pop() }))).toContain('G4')
    expect(codes(run((it) => { it[0].provenance.witnesses[0].name = 'fixture-derived' }))).toContain('G4')
    expect(codes(run((it) => { it[0].provenance.witnesses = [{ ...it[0].provenance.witnesses[1] }, { ...it[0].provenance.witnesses[1], name: 'sunnah-com' }] }))).toContain('G4')
    expect(codes(run((it) => { it[0].provenance.witnesses[1].skeletonSha256 = '0'.repeat(64) }))).toContain('G4')
    expect(codes(run((it) => {
      it[0].provenance.witnesses[1].skeletonSha256 = '0'.repeat(64)
      it[0].provenance.note = 'Witness 2 reads a different word; the print reading is kept.'
    }))).not.toContain('G4')
  })

  it('G5: Quran refs resolve and a Quran item stores no text of its own', () => {
    expect(codes(run((it) => { it[1].quran = { surahId: 112, ayah: 9 } }))).toContain('G5')
    expect(codes(run((it) => { it[1].quran = { surahId: 115, ayah: 1 } }))).toContain('G5')
    expect(codes(run((it) => { it[1].translation = 'Say: He is Allah, One.' }))).toContain('G5')
  })

  it('G6: a quran-name Name must appear in its cited ayah', () => {
    const name = (ref: Item): Item => ({
      id: 'n1', rev: 1, order: 1, arabic: 'الأَحَد', transliteration: 'al-Ahad', meaning: 'The One',
      explanation: 'Fixture explanation.', explanationSource: { work: 'fixture-work', location: 'p. 3' },
      evidence: { kind: 'quran-name', quran: [ref] }, review: { status: 'source-checked' },
    })
    const runName = (ref: Item) => deen.validateDeck(
      { deck: '_fixture', kind: 'names', items: [{ file: 'n1', data: name(ref) }], lock: { ids: {} } }, ctx)
    expect(codes(runName({ surahId: 112, ayah: 1 }))).not.toContain('G6')
    expect(codes(runName({ surahId: 112, ayah: 3 }))).toContain('G6')
  })

  it('G6: a derived Name cites its ayah and a hadith Name says which hadith', () => {
    const runEv = (evidence: Item) => deen.validateDeck({ deck: '_fixture', kind: 'names', lock: { ids: {} }, items: [{ file: 'n1', data: {
      id: 'n1', rev: 1, order: 1, arabic: 'الأحد', transliteration: 'al-Ahad', meaning: 'The One', evidence, review: { status: 'source-checked' },
    } }] }, ctx)
    expect(codes(runEv({ kind: 'quran-derived' }))).toContain('G6')
    expect(codes(runEv({ kind: 'quran-derived', quran: [{ surahId: 112, ayah: 1 }] }))).not.toContain('G6')
    expect(codes(runEv({ kind: 'hadith' }))).toContain('G6')
    expect(codes(runEv({ kind: 'hadith', hadith: 'fixture:01' }))).not.toContain('G6')
    expect(runEv({ kind: 'list-only' }).errors).toEqual([])
  })

  it('G7: Arabic is NFC, Arabic only, no tatweel', () => {
    expect(codes(run((it) => { it[0].arabic = 'هذا نص تجريبي Test' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هـذا نص تجريبي للاختبار فقط' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هذا نص 12 للاختبار' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هذا نص ١٢ للاختبار' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هذا نص'.normalize('NFD') + 'آ' }))).toContain('G7')
  })

  it('G8: every [[term]] resolves; an unmarked glossary term is flagged', () => {
    expect(codes(run((it) => { it[0].translation = 'This is a test text, for testing only, with [[no-such-term]].' }))).toContain('G8')
    const warned = run((it) => { it[0].translation = 'This is a test text about wudu, for testing only.'; it[0].rev = 2; delete it[0].parts })
    expect(warned.errors).toEqual([])
    expect(warned.warnings.map((w: Issue) => w.code)).toContain('G8')
  })

  it('G9: notes and Name explanations carry a source', () => {
    expect(codes(run((it) => { delete it[2].notes[0].source }))).toContain('G9')
    const r = deen.validateDeck({ deck: '_fixture', kind: 'names', lock: { ids: {} }, items: [{ file: 'n1', data: {
      id: 'n1', rev: 1, order: 1, arabic: 'الأحد', transliteration: 'al-Ahad', meaning: 'The One', explanation: 'An unsourced gloss.',
      evidence: { kind: 'list-only' }, review: { status: 'source-checked' },
    } }] }, ctx)
    expect(codes(r)).toContain('G9')
  })

  // Course lessons for G10-G12 and the lesson half of G15
  const lesson = (patch: (l: Item) => void = () => {}) => {
    const l: Item = {
      id: 'l1', unit: 'fixture', order: 1, rev: 1, title: 'Fixture lesson', intro: 'What this lesson covers, in plain words.',
      claims: [
        { id: 'c1', text: 'A fixture claim that two schools put differently.', kind: 'differs', evidence: [],
          positions: [
            { school: 'hanafi', text: 'One position.', source: { work: 'mukhtasar-al-quduri', location: 'Fixture chapter' } },
            { school: 'shafii', text: 'Another position.', source: { work: 'matn-abi-shuja', location: 'Fixture chapter' } },
          ],
          cards: [{ id: 'k1', front: 'Front', back: 'Back' }] },
        { id: 'c2', text: 'A fixture claim held by all.', kind: 'agreed', evidence: [{ consensus: { work: 'al-ijma', location: 'Fixture chapter' } }], cards: [] },
      ],
      check: [{ q: 'Fixture question?', options: ['A', 'B'], answer: 0, claim: 'c1' }],
      review: { status: 'source-checked' },
    }
    patch(l)
    return deen.validateDeck({ deck: '_fixture', kind: 'course', lock: { ids: {} }, unit: { id: 'fixture' }, items: [{ file: 'l1', data: l }] }, ctx)
  }

  it('the fixture lesson passes', () => {
    expect(lesson().errors).toEqual([])
  })

  it('G10: differences need two sourced positions; agreement needs evidence', () => {
    expect(codes(lesson((l) => { l.claims[0].positions.pop() }))).toContain('G10')
    expect(codes(lesson((l) => { delete l.claims[0].positions[1].source }))).toContain('G10')
    expect(codes(lesson((l) => { l.claims[1].evidence = [] }))).toContain('G10')
    expect(codes(lesson((l) => { l.claims[1].evidence = [{ consensus: { work: 'al-ijma' } }] }))).toContain('G10')
  })

  it('G10: a school position is sourced wherever it appears, not only under "differs"', () => {
    const withPosition = (p: Item) => lesson((l) => { l.claims[1].positions = [p] })
    expect(withPosition({ school: 'maliki', text: 'A detail.', source: { work: 'al-risala', location: 'Fixture chapter' } }).errors).toEqual([])
    expect(codes(withPosition({ school: 'maliki', text: 'A detail.' }))).toContain('G10')
    expect(codes(withPosition({ school: 'zahiri', text: 'A detail.', source: { work: 'al-risala', location: 'Fixture chapter' } }))).toContain('G10')
  })

  it('G11: the intro is at most 60 words and makes no rulings', () => {
    expect(codes(lesson((l) => { l.intro = 'word '.repeat(61).trim() }))).toContain('G11')
    expect(codes(lesson((l) => { l.intro = 'Wudu is obligatory before the prayer.' }))).toContain('G11')
    expect(codes(lesson((l) => { l.intro = 'Learn when [[wudu]] is [[fard]].' }))).toContain('G11')
  })

  it('G12: no "correct opinion", no "strongest view", no bare "scholars agree"', () => {
    expect(codes(lesson((l) => { l.claims[0].positions[0].text = 'This is the correct opinion.' }))).toContain('G12')
    expect(codes(lesson((l) => { l.claims[0].text = 'The strongest view is the first.' }))).toContain('G12')
    expect(codes(lesson((l) => { l.claims[0].text = 'The scholars agree on this.' }))).toContain('G12')
    // With a consensus citation, saying so is fine
    expect(codes(lesson((l) => { l.claims[1].text = 'The scholars agree on this.' }))).not.toContain('G12')
  })

  it('G12: the same phrasing in other words, and in the intro, title and check questions', () => {
    for (const text of ['This is the more correct view.', 'The stronger opinion is the first.', 'The scholars have agreed on this.', 'All the scholars hold this.', 'This is held unanimously.', 'There is no disagreement on this.']) {
      expect(codes(lesson((l) => { l.claims[0].text = text })), text).toContain('G12')
    }
    expect(codes(lesson((l) => { l.intro = 'The scholars agree on what follows.' }))).toContain('G12')
    expect(codes(lesson((l) => { l.title = 'The correct opinion on wiping' }))).toContain('G12')
    expect(codes(lesson((l) => { l.check[0].q = 'Which is the strongest view?' }))).toContain('G12')
    expect(codes(lesson((l) => { l.check[0].options = ['The correct opinion', 'B'] }))).toContain('G12')
    // A question about an agreed claim may say so; one about a differing claim may not
    expect(codes(lesson((l) => { l.check[0] = { q: 'What do the scholars agree on?', options: ['A', 'B'], answer: 0, claim: 'c2' } }))).not.toContain('G12')
    expect(codes(lesson((l) => { l.check[0].q = 'What do the scholars agree on?' }))).toContain('G12')
    // Plain descriptive wording is untouched
    expect(lesson((l) => { l.claims[0].text = 'The schools put this differently, and each has its evidence.' }).errors).toEqual([])
  })

  it('G13: two glossary files may not define a term differently', () => {
    const merged = deen.mergeGlossaries([
      { name: 'core', terms: [{ id: 'wudu', arabic: 'وضوء', translit: 'wudu', short: 'Washing for prayer.' }] },
      { name: 'other', terms: [{ id: 'wudu', arabic: 'وضوء', translit: 'wudu', short: 'Something else.' }] },
    ])
    expect(merged.errors.map((e: Issue) => e.code)).toContain('G13')
    const same = deen.mergeGlossaries([
      { name: 'core', terms: [{ id: 'wudu', arabic: 'وضوء', translit: 'wudu', short: 'Washing for prayer.' }] },
      { name: 'other', terms: [{ id: 'wudu', arabic: 'وضوء', translit: 'wudu', short: 'Washing for prayer.' }] },
    ])
    expect(same.errors).toEqual([])
  })

  it('G14: locked ids never disappear; a change must raise rev', () => {
    expect(codes(run((it, lock) => { lock.ids['99'] = { rev: 1, hash: 'x' } }))).toContain('G14')
    expect(codes(run((it) => { it[0].translation = 'This is a changed test text, for testing only.' }))).toContain('G14')
    const bumped = run((it) => { it[0].translation = 'This is a changed test text, for testing only.'; it[0].rev = 2; delete it[0].parts })
    expect(bumped.errors).toEqual([])
    expect(bumped.lock.ids['01'].rev).toBe(2)
    expect(codes(run((it) => { it[0].review.status = 'draft' }))).toContain('G14')
    expect(codes(run((it, lock) => { it[0].review.status = 'draft'; lock.ids['01'].withdrawn = 'Fixture withdrawal' }))).not.toContain('G14')
    // A rev only rises
    expect(codes(run((it, lock) => { lock.ids['01'].rev = 3 }))).toContain('G14')
    // Review-only changes need no rev bump
    expect(codes(run((it) => { it[0].review.log = ['another pass'] }))).not.toContain('G14')
  })

  it('G15: translation length, at most 3 notes, at most 6 claims', () => {
    expect(codes(run((it) => { it[0].translation = 'Test.' }))).toContain('G15')
    expect(codes(run((it) => { it[0].translation = 'word '.repeat(20).trim() }))).toContain('G15')
    expect(codes(run((it) => { it[2].notes = Array(4).fill(it[2].notes[0]) }))).toContain('G15')
    expect(codes(lesson((l) => { l.claims = Array.from({ length: 7 }, (_, i) => ({ ...l.claims[1], id: `c${i}` })); l.check = [] }))).toContain('G15')
  })

  it('an erroring item is never emitted', () => {
    const r = run((it) => { it[2].gradings = [] })
    expect(r.emitted.map((i: Item) => i.id)).toEqual(['01', '02'])
  })
})

// ---------- learning parts (STYLE.md, "Learning parts") ----------

describe('learning parts', () => {
  // Fixture 01: five Arabic words, parts after the third; English cut after "text,"
  const AR = 'هَذَا نَصٌّ تَجْرِيبِيٌّ لِلِاخْتِبَارِ فَقَطْ'
  const EN = 'This is a test text, for testing only, with [[dhikr]] marked.'
  const item = (parts: unknown, extra: Item = {}): Item => ({ arabic: AR, translation: EN, parts, ...extra })

  it('accepts the fixture parts, and an item without any', () => {
    expect(deen.checkParts(fixture.items[0].data)).toEqual([])
    expect(deen.checkParts({ arabic: AR, translation: EN })).toEqual([])
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [20, EN.length] }))).toEqual([])
  })

  it('wants one English part per Arabic part, and at least two', () => {
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [EN.length] })).join()).toMatch(/one English part per Arabic part/)
    expect(deen.checkParts(item({ ar: [AR.length], en: [EN.length] })).join()).toMatch(/at least two/)
    expect(deen.checkParts(item({ ar: [24, AR.length] })).join()).toMatch(/must be \{ ar/)
  })

  it('wants increasing offsets, in range, ending at the end of the text', () => {
    expect(deen.checkParts(item({ ar: [24, 10], en: [20, EN.length] })).join()).toMatch(/parts\.ar must be increasing/)
    expect(deen.checkParts(item({ ar: [24, AR.length + 5], en: [20, EN.length] })).join()).toMatch(/parts\.ar must be increasing/)
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [0, EN.length] })).join()).toMatch(/parts\.en must be increasing/)
    expect(deen.checkParts(item({ ar: [10, 24], en: [20, EN.length] })).join()).toMatch(/parts\.ar must end at the end of the text/)
  })

  it('refuses a cut inside a word, or inside square brackets', () => {
    expect(deen.checkParts(item({ ar: [20, AR.length], en: [20, EN.length] })).join()).toMatch(/parts\.ar\[0\] \(20\) is not at the end of a word/)
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [18, EN.length] })).join()).toMatch(/parts\.en\[0\] \(18\) is not at the end of a word/)
    const bracketed = 'He grazes [his own flock] around it.'
    expect(deen.checkParts({ arabic: AR, translation: bracketed, parts: { ar: [24, AR.length], en: [18, bracketed.length] } }).join()).toMatch(/cuts inside square brackets/)
  })

  it('refuses a cut inside a name, or one that strands an honorific', () => {
    // Nawawi 11 as the old automatic split had it: "… بن علي بن أبي | طالب"
    const name = 'عَنِ الْحَسَنِ بْنِ عَلِيِّ بْنِ أَبِي طَالِبٍ قَالَ'
    const english = 'From al-Hasan ibn Ali ibn Abi Talib, who said'
    const cutAfter = (word: string) => name.indexOf(word) + word.length
    const at = (ar: number) => deen.checkParts({ arabic: name, translation: english, parts: { ar: [ar, name.length], en: [4, english.length] } }).join()
    expect(at(cutAfter('أَبِي'))).toMatch(/ends inside a name/)
    expect(at(cutAfter('عَلِيِّ بْنِ'))).toMatch(/ends inside a name/)
    expect(at(cutAfter('عَلِيِّ'))).toMatch(/starts inside a name/)
    expect(at(cutAfter('طَالِبٍ'))).toBe('')
    const honorific = 'قَالَ رَسُولُ اللَّهِ ﷺ كَذَا'
    expect(deen.checkParts({ arabic: honorific, translation: english, parts: { ar: [honorific.indexOf('ﷺ') - 1, honorific.length], en: [4, english.length] } }).join()).toMatch(/honorific/)
  })

  it('keeps parts inside the reading segments and the translation paragraphs', () => {
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [20, EN.length] }, { segments: [AR.indexOf(' '), AR.length] })).join()).toMatch(/segments end \d+ is not a parts\.ar end/)
    // An offset inside a word counts as that word's end, as the app reads it
    expect(deen.checkParts(item({ ar: [24, AR.length], en: [20, EN.length] }, { segments: [17, 43] }))).toEqual([])
    const paras = 'This is a test text,\n\nfor testing only.'
    expect(deen.checkParts({ arabic: AR, translation: paras, parts: { ar: [24, AR.length], en: [7, paras.length] } }).join()).toMatch(/paragraph break at 20 is not a parts\.en end/)
    expect(deen.checkParts({ arabic: AR, translation: paras, parts: { ar: [24, AR.length], en: [20, paras.length] } })).toEqual([])
  })

  it('a Quran item takes no parts', () => {
    expect(deen.checkParts({ quran: { surahId: 112, ayah: 1 }, parts: { ar: [1, 2], en: [1, 2] } }).join()).toMatch(/takes no parts/)
  })

  it('bad parts fail the deck (PARTS); moving a cut needs no rev raise', () => {
    expect(codes(run((it) => { it[0].parts = { ar: [20, 46], en: [20, 61] } }))).toContain('PARTS')
    const moved = run((it) => { it[0].parts = { ar: [AR.indexOf(' '), 46], en: [7, 61] }; delete it[0].segments })
    expect(moved.errors.filter((e: Issue) => e.code === 'PARTS')).toEqual([])
    const removed = run((it) => { delete it[0].parts })
    expect(removed.errors).toEqual([])
    expect(removed.lockChanged).toBe(false)
    const fixtureItem = fixture.items[0].data
    expect(deen.itemHash({ ...fixtureItem, parts: { ar: [10, 46], en: [7, 61] } })).toBe(deen.itemHash(fixtureItem))
    expect(deen.itemHash({ ...fixtureItem, translation: 'Other words.' })).not.toBe(deen.itemHash(fixtureItem))
  })

  it('every shipped hadith and dua over ten words has parts of at most fourteen words, matched in English', () => {
    const res = deen.checkAll()
    let withParts = 0
    for (const [id, r] of Object.entries(res.results) as Array<[string, { emitted: Item[]; spec: { kind: string } }]>) {
      if (r.spec.kind !== 'hadith' && r.spec.kind !== 'dhikr') continue
      for (const it of r.emitted) {
        if (it.quran) {
          expect(it.parts, `${id}:${it.id}`).toBeUndefined()
          continue
        }
        const count = it.arabic.split(/\s+/).length
        if (count > 10) expect(it.parts, `${id}:${it.id} (${count} words) needs parts`).toBeDefined()
        if (!it.parts) continue
        withParts++
        let a = 0
        let e = 0
        it.parts.ar.forEach((end: number, i: number) => {
          const ar = it.arabic.slice(a, end).trim()
          const en = it.translation.slice(e, it.parts.en[i]).trim()
          expect(ar.split(/\s+/).length, `${id}:${it.id} part ${i + 1}`).toBeLessThanOrEqual(14)
          expect(en.length, `${id}:${it.id} part ${i + 1} English`).toBeGreaterThan(0)
          a = end
          e = it.parts.en[i]
        })
      }
    }
    expect(withParts).toBeGreaterThanOrEqual(39)
  })
})
