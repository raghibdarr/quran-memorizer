import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as deen from '../../../../scripts/build-deen.mjs'
import deck from './course-fasting'
import type { EmittedDeck, GlossaryTerm, Lesson, TextItem } from '@/types/deen'

// Unit Fasting: what the brief asks of the content beyond the shared guardrails
// (those run in src/lib/deen/content-integrity.test.ts).

const root = join(__dirname, '..', '..', '..', '..')
const unitDir = join(root, 'content', 'deen', 'course', 'fasting')
const readJson = <T,>(...p: string[]): T => JSON.parse(readFileSync(join(...p), 'utf8')) as T

const lessonFiles = readdirSync(join(unitDir, 'lessons')).filter((f) => f.endsWith('.json')).sort()
const lessons = lessonFiles.map((f) => readJson<Lesson>(unitDir, 'lessons', f))
const inOrder = [...lessons].sort((a, b) => a.order - b.order)
const evidenceFiles = readdirSync(join(unitDir, 'evidence')).filter((f) => f.endsWith('.json')).sort()
const evidence = evidenceFiles.map((f) => ({ file: f.replace(/\.json$/, ''), data: readJson<TextItem>(unitDir, 'evidence', f) }))

const PRIMERS: Record<string, string> = {
  hanafi: 'mukhtasar-al-quduri',
  maliki: 'al-risala',
  shafii: 'matn-abi-shuja',
  hanbali: 'umdat-al-fiqh',
}
const EVIDENCE_DECK = 'course-fasting-evidence'

describe('course-fasting deck module', () => {
  it('is ready and loads every lesson, in order, with its glossary', async () => {
    expect(deck.ready).toBe(true)
    if (!deck.ready) return
    const loaded = await deck.load()
    const emitted = ('default' in loaded ? loaded.default : loaded) as EmittedDeck
    const items = emitted.items as unknown as Lesson[]
    expect(items.map((l) => l.id)).toEqual(inOrder.map((l) => l.id))
    expect(items.every((l) => l.review.status === 'source-checked')).toBe(true)
    const g = await deck.glossary!()
    const terms = ('default' in g ? g.default : g) as GlossaryTerm[]
    expect(terms.map((t) => t.id)).toEqual(expect.arrayContaining(['fidyah', 'kaffarah', 'mudd']))
  })

  it('never claims scholar review', () => {
    for (const l of lessons) expect(l.review.status).not.toBe('scholar-reviewed')
    for (const e of evidence) expect(e.data.review.status).not.toBe('scholar-reviewed')
  })
})

describe('unit.json', () => {
  const unit = readJson<{ id: string; deck: string; lessons: string[]; primers: Record<string, string>; footer: string }>(unitDir, 'unit.json')

  it('lists exactly the lesson files, in lesson order', () => {
    expect(unit.deck).toBe('course-fasting')
    expect(unit.lessons).toEqual(inOrder.map((l) => l.id))
    expect(lessons.every((l) => l.unit === unit.id)).toBe(true)
    expect(new Set(lessons.map((l) => l.order)).size).toBe(lessons.length)
  })

  it('names the four fixed primers and the closing line', () => {
    expect(unit.primers).toEqual(PRIMERS)
    expect(unit.footer).toBe('For your own situation, ask a scholar you trust.')
  })
})

describe('lessons follow the brief', () => {
  it('each lesson has at most 6 claims and 2 to 4 check questions that point at a claim', () => {
    for (const l of lessons) {
      expect(l.claims.length, l.id).toBeGreaterThan(0)
      expect(l.claims.length, l.id).toBeLessThanOrEqual(6)
      expect(l.check.length, l.id).toBeGreaterThanOrEqual(2)
      expect(l.check.length, l.id).toBeLessThanOrEqual(4)
      const ids = new Set(l.claims.map((c) => c.id))
      for (const q of l.check) {
        expect(ids.has(q.claim), `${l.id}: check points at "${q.claim}"`).toBe(true)
        expect(q.options.length, `${l.id}: ${q.q}`).toBeGreaterThanOrEqual(2)
        expect(new Set(q.options).size, `${l.id}: ${q.q}`).toBe(q.options.length)
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length, `${l.id}: ${q.q}`).toBe(true)
      }
    }
  })

  it('every claim has evidence and 1 or 2 recall cards of its own', () => {
    for (const l of lessons) for (const c of l.claims) {
      expect(c.evidence.length, `${l.id}/${c.id}`).toBeGreaterThan(0)
      const own = c.cards.filter((k) => !k.school)
      expect(own.length, `${l.id}/${c.id}`).toBeGreaterThanOrEqual(1)
      expect(own.length, `${l.id}/${c.id}`).toBeLessThanOrEqual(2)
    }
  })

  it('card ids are unique across the unit and carry their claim id', () => {
    const seen = new Set<string>()
    for (const l of lessons) for (const c of l.claims) for (const k of c.cards) {
      expect(seen.has(k.id), k.id).toBe(false)
      seen.add(k.id)
      expect(k.id.startsWith(`${c.id}-`), k.id).toBe(true)
    }
  })

  it('a position cites the fixed primer of its school by chapter, with the Arabic phrase', () => {
    for (const l of lessons) for (const c of l.claims) for (const p of c.positions ?? []) {
      const where = `${l.id}/${c.id}/${p.school}`
      expect(p.source.work, where).toBe(PRIMERS[p.school])
      expect(p.source.location.trim().length, where).toBeGreaterThan(0)
      expect((p.quote ?? '').trim().length, where).toBeGreaterThan(0)
    }
  })

  it('a "differs" claim has one school card for each position it shows, and no others', () => {
    for (const l of lessons) for (const c of l.claims) {
      const schools = (c.positions ?? []).map((p) => p.school as string).sort()
      const cardSchools = c.cards.filter((k) => k.school).map((k) => k.school as string).sort()
      if (c.kind === 'differs') expect(cardSchools, `${l.id}/${c.id}`).toEqual(schools)
      else for (const s of cardSchools) expect(schools, `${l.id}/${c.id}`).toContain(s)
    }
  })

  it('modern medical questions are sent to a scholar, not answered', () => {
    const l = lessons.find((x) => x.id === 'fasting-03-what-breaks-the-fast')!
    expect(l.intro).toMatch(/ask a scholar you trust/)
    const all = JSON.stringify(lessons.map((x) => x.claims))
    expect(all).not.toMatch(/inhaler|injection|insulin|eye drops|vaccin/i)
  })

  it('fidya and kaffara are never worked out in money or modern weights', () => {
    const all = JSON.stringify(lessons.map((x) => [x.intro, x.claims, x.check]))
    expect(all).not.toMatch(/[$£€]|\b\d+(\.\d+)?\s?(kg|g|grams?|kilos?|litres?|liters?|ml)\b/i)
  })
})

describe('evidence hadith (not yet read by the shared build, see HANDOFF.md)', () => {
  const res = deen.validateDeck({ deck: EVIDENCE_DECK, kind: 'hadith', items: evidence, lock: { ids: {} } }, deen.makeContext(root))

  it('pass the same guardrails as a hadith deck', () => {
    expect(res.errors).toEqual([])
    expect(res.emitted.length).toBe(evidence.length)
  })

  it('every evidence item a lesson cites exists and is source-checked, and none is unused', () => {
    const ids = new Set((res.emitted as { id: string }[]).map((it) => it.id))
    const cited = new Set<string>()
    for (const l of lessons) for (const c of l.claims) for (const e of c.evidence) {
      if (!('item' in e)) continue
      expect(e.item.startsWith(`${EVIDENCE_DECK}:`), `${l.id}/${c.id}: ${e.item}`).toBe(true)
      const id = e.item.slice(EVIDENCE_DECK.length + 1)
      expect(ids.has(id), `${l.id}/${c.id}: ${e.item}`).toBe(true)
      cited.add(id)
    }
    expect([...cited].sort()).toEqual([...ids].sort())
  })

  it('the iftar dua carries its attributed grading, and the second wording is marked mursal', () => {
    const dua = evidence.find((e) => e.data.id === 'iftar-dhahaba-al-zama')!.data
    expect(dua.citations[0]).toMatchObject({ collection: 'abu-dawud', number: '2357' })
    expect(dua.gradings[0]).toMatchObject({ grade: 'hasan', by: 'al-daraqutni' })
    expect(dua.gradings[0].quote).toBeTruthy()
    expect(dua.variants?.[0].citations[0]).toMatchObject({ collection: 'abu-dawud', number: '2358' })
    expect(dua.variants?.[0].label).toMatch(/mursal/)
    const claim = lessons.flatMap((l) => l.claims).find((c) => c.id === 'iftar-dua')!
    expect(claim.text).toMatch(/\[\[mursal\]\], as al-Nawawi notes/)
    expect(claim.text).toMatch(/Al-Daraqutni called the chain of the first report \[\[hasan\]\]/)
  })
})
