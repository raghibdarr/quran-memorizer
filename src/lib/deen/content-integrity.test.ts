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

  it('G3: outside the two Sahihs an attributed grading is required', () => {
    expect(codes(run((it) => { it[2].gradings = [] }))).toContain('G3')
    expect(codes(run((it) => { it[2].gradings[0].by = 'someone-unknown' }))).toContain('G3')
    expect(codes(run((it) => { it[2].gradings[0].in = '' }))).toContain('G3')
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

  it('G7: Arabic is NFC, Arabic only, no tatweel', () => {
    expect(codes(run((it) => { it[0].arabic = 'هذا نص تجريبي Test' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هـذا نص تجريبي للاختبار فقط' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هذا نص 12 للاختبار' }))).toContain('G7')
    expect(codes(run((it) => { it[0].arabic = 'هذا نص'.normalize('NFD') + 'آ' }))).toContain('G7')
  })

  it('G8: every [[term]] resolves; an unmarked glossary term is flagged', () => {
    expect(codes(run((it) => { it[0].translation = 'This is a test text, for testing only, with [[no-such-term]].' }))).toContain('G8')
    const warned = run((it) => { it[0].translation = 'This is a test text about wudu, for testing only.'; it[0].rev = 2 })
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
    const bumped = run((it) => { it[0].translation = 'This is a changed test text, for testing only.'; it[0].rev = 2 })
    expect(bumped.errors).toEqual([])
    expect(bumped.lock.ids['01'].rev).toBe(2)
    expect(codes(run((it) => { it[0].review.status = 'draft' }))).toContain('G14')
    expect(codes(run((it, lock) => { it[0].review.status = 'draft'; lock.ids['01'].withdrawn = 'Fixture withdrawal' }))).not.toContain('G14')
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
