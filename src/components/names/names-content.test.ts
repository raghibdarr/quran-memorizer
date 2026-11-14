import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as deen from '../../../scripts/build-deen.mjs'
import { checkNames, nameOccurs, readItems } from '../../../content/deen/names99/check-names.mjs'
import deck from '@/content/deen/decks/names99'
import type { EmittedDeck, GlossaryTerm, NameItem } from '@/types/deen'

// The Names deck: what the brief asks beyond the shared guardrails
// (those run in src/lib/deen/content-integrity.test.ts).

const root = join(__dirname, '..', '..', '..')
const items = readItems() as NameItem[]
const words = (s: string) => (s.match(/\S+/g) ?? []).length

// The enumeration narrated through al-Tirmidhi, in order (Allah, then 98 Names)
const LIST = [
  'الله', 'الرحمن', 'الرحيم', 'الملك', 'القدوس', 'السلام', 'المومن', 'المهيمن', 'العزيز', 'الجبار',
  'المتكبر', 'الخالق', 'الباري', 'المصور', 'الغفار', 'القهار', 'الوهاب', 'الرزاق', 'الفتاح', 'العليم',
  'القابض', 'الباسط', 'الخافض', 'الرافع', 'المعز', 'المذل', 'السميع', 'البصير', 'الحكم', 'العدل',
  'اللطيف', 'الخبير', 'الحليم', 'العظيم', 'الغفور', 'الشكور', 'العلي', 'الكبير', 'الحفيظ', 'المقيت',
  'الحسيب', 'الجليل', 'الكريم', 'الرقيب', 'المجيب', 'الواسع', 'الحكيم', 'الودود', 'المجيد', 'الباعث',
  'الشهيد', 'الحق', 'الوكيل', 'القوي', 'المتين', 'الولي', 'الحميد', 'المحصي', 'المبدي', 'المعيد',
  'المحيي', 'المميت', 'الحي', 'القيوم', 'الواجد', 'الماجد', 'الواحد', 'الصمد', 'القادر', 'المقتدر',
  'المقدم', 'الموخر', 'الاول', 'الاخر', 'الظاهر', 'الباطن', 'الوالي', 'المتعالي', 'البر', 'التواب',
  'المنتقم', 'العفو', 'الرءوف', 'مالك الملك', 'ذو الجلال والاكرام', 'المقسط', 'الجامع', 'الغني', 'المغني', 'المانع',
  'الضار', 'النافع', 'النور', 'الهادي', 'البديع', 'الباقي', 'الوارث', 'الرشيد', 'الصبور',
]

describe('names99 content', () => {
  it('has the 99 Names of the enumerated list, in its order', () => {
    expect(LIST).toHaveLength(99)
    expect(items).toHaveLength(99)
    items.forEach((it, i) => {
      expect(it.order).toBe(i + 1)
      expect(it.id).toBe(String(i + 1).padStart(3, '0'))
      expect(deen.arabicSkeleton(it.arabic)).toBe(LIST[i])
    })
  })

  it('keeps meanings to 12 words and explanations to 40', () => {
    for (const it of items) {
      expect(words(it.meaning), it.id).toBeLessThanOrEqual(12)
      expect(words(it.explanation), it.id).toBeLessThanOrEqual(40)
      expect(it.transliteration, it.id).toMatch(/^[A-Z]/)
    }
  })

  it('passes the strict checker: Names in their ayat as words, derived forms copied exactly', () => {
    expect(checkNames(items)).toEqual([])
  })

  it('the strict checker catches a Name cited to an ayah it is not in', () => {
    const rahman = items[1]
    const wrong = { ...rahman, evidence: { kind: 'quran-name' as const, quran: [{ surahId: 112, ayah: 1 }] } }
    expect(checkNames([items[0], wrong, ...items.slice(2)])).toEqual(['002: 112:1 does not contain the Name as a word'])
    expect(nameOccurs('ٱلْعَلِيُّ', 'وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ')).toBe(true)
    expect(nameOccurs('ٱلْعَلِيُّ', 'عَلَىٰ كُلِّ شَىْءٍ')).toBe(false)
  })

  it('labels the list-only Names, and gives every other Name its evidence', () => {
    const listOnly = items.filter((it) => it.evidence.kind === 'list-only').map((it) => it.id)
    expect(listOnly).toEqual(['023', '030', '042', '065', '066', '090', '098', '099'])
    for (const it of items) {
      const ev = it.evidence
      if (ev.kind === 'quran-name' || ev.kind === 'quran-derived') expect(ev.quran?.length, it.id).toBeGreaterThan(0)
      if (ev.kind === 'quran-derived') expect(ev.form, it.id).toBeTruthy()
      if (ev.kind === 'hadith') expect(ev.hadith, it.id).toMatch(/Sahih Muslim 771/)
      if (ev.kind === 'list-only') {
        expect(ev.quran, it.id).toBeUndefined()
        expect(it.explanation, it.id).toMatch(/enumerated list, not as a Name in the Quran/)
      }
      expect(it.explanationSource?.work, it.id).toBeTruthy()
    }
  })

  it('is source-checked, never labelled scholar-reviewed', () => {
    for (const it of items) {
      expect(it.review.status).toBe('source-checked')
      expect(it.review.by).toBeUndefined()
    }
  })

  it('builds clean, with every item emitted and locked', () => {
    const res = deen.checkAll(root, { decks: ['names99'] })
    expect(res.errors).toEqual([])
    expect(res.warnings.filter((w: { code: string }) => w.code !== 'DRAFT')).toEqual([])
    expect((res.results as Record<string, { emitted: unknown[] }>).names99.emitted).toHaveLength(99)
    const lock = JSON.parse(readFileSync(join(root, 'content', 'deen', 'names99', 'ids.lock.json'), 'utf8'))
    expect(Object.keys(lock.ids)).toHaveLength(99)
  })
})

describe('names99 deck module', () => {
  it('is ready and loads the emitted deck and glossary', async () => {
    expect(deck.ready).toBe(true)
    if (!deck.ready) return
    const d = (await deck.load()) as EmittedDeck
    expect(d.deck).toBe('names99')
    expect(d.kind).toBe('names')
    expect(d.items).toHaveLength(99)
    // The emitted copy matches the authored items (rebuild after editing: build-deen --deck names99)
    const authored = new Map(items.map((it) => [it.id, it]))
    for (const it of d.items as NameItem[]) {
      const src = authored.get(it.id)!
      expect(it.arabic).toBe(src.arabic)
      expect(it.meaning).toBe(src.meaning)
      expect(it.rev).toBe(src.rev)
    }
    const g = (await deck.glossary!()) as GlossaryTerm[]
    expect(g.map((t) => t.id)).toEqual(['asma-husna'])
  })
})
