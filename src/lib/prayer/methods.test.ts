import { describe, expect, it } from 'vitest'
import { METHODS, isMethodId } from './methods'
import { METHOD_IDS } from '@/types/prayer'

describe('method ids', () => {
  it('the light id list (used by the prayer store on Home) matches the method table', () => {
    expect([...METHOD_IDS].sort()).toEqual(METHODS.map((m) => m.id).sort())
  })

  it('isMethodId accepts every method and nothing else', () => {
    for (const m of METHODS) expect(isMethodId(m.id)).toBe(true)
    for (const bad of ['', 'mwl', 'Custom', null, 3, undefined]) expect(isMethodId(bad)).toBe(false)
  })
})
