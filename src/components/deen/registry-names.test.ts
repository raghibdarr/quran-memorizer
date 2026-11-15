import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { citationText, collectionName, humanizeName, numberingLabel, scholarName, SIDECARS, sunnahComUrl, workTitle } from './registry-names'
import { gradingText } from './text'

const CONTENT = join(__dirname, '../../../content/deen')
const DATA = join(__dirname, '../../data/deen')

/** Every package sidecar on disk (the test fixture's excluded), as paths under content/deen */
function sidecarsOnDisk(dir = CONTENT): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name !== '_fixture') out.push(...sidecarsOnDisk(join(dir, e.name)))
    } else if (e.name === 'registry-additions.json') out.push(relative(CONTENT, join(dir, e.name)).split(sep).join('/'))
  }
  return out
}

describe('display names for cited ids', () => {
  it('every package sidecar is listed in SIDECARS, with the content on disk', () => {
    const onDisk = sidecarsOnDisk().sort()
    expect(Object.keys(SIDECARS).sort()).toEqual(onDisk)
    for (const path of onDisk) {
      expect(SIDECARS[path]).toEqual(JSON.parse(readFileSync(join(CONTENT, path), 'utf8')))
    }
  })

  it('names ids that only a sidecar defines', () => {
    expect(scholarName('ibn-rajab')).toBe('Ibn Rajab al-Hanbali')
    expect(collectionName('ahmad')).toBe('Musnad Ahmad')
    expect(workTitle('jami-al-ulum-wa-al-hikam')).toBe("Jami' al-'Ulum wa al-Hikam")
    expect(citationText({ collection: 'muwatta', number: '12', numbering: 'muwatta-abd-al-baqi' })).toBe("al-Muwatta' of Malik 12 (Abd al-Baqi numbering)")
    expect(gradingText({ grade: 'hasan', by: 'ibn-rajab', in: 'jami-al-ulum-wa-al-hikam' })).toBe("Hasan: Ibn Rajab al-Hanbali, in Jami' al-'Ulum wa al-Hikam")
    expect(numberingLabel('risala-musnad')).toBe("the Mu'assasat al-Risala edition numbering")
    // A sidecar collection has no Sunnah.com slug: no link is made up for it
    expect(sunnahComUrl({ collection: 'ahmad', number: '12', numbering: 'risala-musnad' })).toBeNull()
  })

  it('the shared files win over a sidecar', () => {
    expect(collectionName('muslim')).toBe('Sahih Muslim')
    expect(scholarName('al-nawawi')).toBe('al-Nawawi')
  })

  it('an unknown person id still reads as a name', () => {
    expect(humanizeName('ibn-someone')).toBe('Ibn Someone')
    expect(humanizeName('al-someone')).toBe('al-Someone')
    expect(humanizeName('abd-allah-ibn-someone')).toBe('Abd Allah ibn Someone')
    expect(scholarName('fixture-scholar')).toBe('Fixture Scholar')
    expect(humanizeName('')).toBe('')
  })

  it('every collection, numbering and scholar the shipped decks cite has a real name', () => {
    if (!existsSync(DATA)) return
    const unnamed: string[] = []
    for (const f of readdirSync(DATA).filter((n) => n.endsWith('.json'))) {
      const deck = JSON.parse(readFileSync(join(DATA, f), 'utf8')) as { items?: { citations?: { collection: string; numbering: string; altNumbers?: { numbering: string }[] }[]; gradings?: { by: string }[] }[] }
      for (const item of deck.items ?? []) {
        for (const c of item.citations ?? []) {
          if (!(SHARED_OR_SIDECAR.collections.has(c.collection))) unnamed.push(`collection:${c.collection}`)
          for (const n of [c.numbering, ...(c.altNumbers ?? []).map((a) => a.numbering)]) if (!SHARED_OR_SIDECAR.numberings.has(n)) unnamed.push(`numbering:${n}`)
        }
        for (const g of item.gradings ?? []) if (!SHARED_OR_SIDECAR.scholars.has(g.by)) unnamed.push(`scholar:${g.by}`)
      }
    }
    expect([...new Set(unnamed)]).toEqual([])
  })
})

/** The ids the shared files and the listed sidecars define */
const SHARED_OR_SIDECAR = (() => {
  const read = (f: string) => JSON.parse(readFileSync(join(CONTENT, f), 'utf8'))
  const cols = read('collections.json') as { collections: { id: string }[]; numberings: { id: string }[] }
  const sch = read('scholars.json') as { scholars: { id: string }[] }
  const ids = (shared: { id: string }[], key: 'collections' | 'numberings' | 'scholars') =>
    new Set([...shared, ...Object.values(SIDECARS).flatMap((s) => s[key] ?? [])].map((e) => e.id))
  return { collections: ids(cols.collections, 'collections'), numberings: ids(cols.numberings, 'numberings'), scholars: ids(sch.scholars, 'scholars') }
})()
