import { beforeEach, describe, expect, it } from 'vitest'
import { clearPosition, loadPosition, POSITION_TTL_MS, positionKey, savePosition } from './flow-position'

const store = new Map<string, string>()
beforeEach(() => {
  store.clear()
  ;(globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  }
})

describe('memorise flow position', () => {
  const key = positionKey('nawawi40', '02', 'arabic')

  it('keeps the Build unit reached and offers it back', () => {
    savePosition(key, { step: 'build', unit: 7, units: 30 }, 1000)
    expect(loadPosition(key, 30, 2000)).toMatchObject({ step: 'build', unit: 7 })
  })

  it('offers nothing for the first unit, a changed set of parts, or an old entry', () => {
    savePosition(key, { step: 'build', unit: 0, units: 30 }, 1000)
    expect(loadPosition(key, 30, 2000)).toBeNull()
    savePosition(key, { step: 'build', unit: 5, units: 30 }, 1000)
    expect(loadPosition(key, 31, 2000)).toBeNull()
    expect(loadPosition(key, 30, 1000 + POSITION_TTL_MS + 1)).toBeNull()
  })

  it('keeps a Recall position, and clears on finishing', () => {
    savePosition(key, { step: 'recall', unit: 0, units: 30 }, 1000)
    expect(loadPosition(key, 30, 2000)?.step).toBe('recall')
    clearPosition(key)
    expect(loadPosition(key, 30, 2000)).toBeNull()
  })

  it('survives broken storage', () => {
    store.set('takrar-memorise-pos', '{not json')
    expect(loadPosition(key, 30)).toBeNull()
    savePosition(key, { step: 'build', unit: 2, units: 5 })
    expect(loadPosition(key, 5)?.unit).toBe(2)
  })
})
