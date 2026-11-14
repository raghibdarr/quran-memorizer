import { describe, expect, it } from 'vitest'
import { monthGrid } from './calendar'
import { gridMarks } from './grid-marks'

const byDay = (year: number, month: number) => {
  const g = monthGrid({ year, month })
  const marks = gridMarks(g)
  return new Map(g.days.map((d) => [d.hijri.day, marks.get(d.iso)!]))
}

describe('month grid marks', () => {
  it('Ramadan: no mark for the month itself, a line under the last ten nights', () => {
    const m = byDay(1448, 9)
    expect(m.get(1)).toEqual({ dot: null, bar: null })
    expect(m.get(20)).toEqual({ dot: null, bar: null })
    expect(m.get(21)?.bar).toEqual({ kind: 'occasion', start: true, end: false })
    expect(m.get(25)?.bar).toEqual({ kind: 'occasion', start: false, end: false })
    const last = Math.max(...m.keys())
    expect(m.get(last)?.bar?.end).toBe(true)
    expect([...m.values()].filter((x) => x.dot)).toHaveLength(0)
  })

  it('Dhul-Hijjah: the first ten as a line, Arafah (a fast) and Eid still dotted', () => {
    const m = byDay(1448, 12)
    expect(m.get(1)?.bar).toEqual({ kind: 'occasion', start: true, end: false })
    expect(m.get(10)?.bar?.end).toBe(true)
    expect(m.get(9)?.dot).toBe('fast')
    expect(m.get(10)?.dot).toBe('occasion')
    expect(m.get(11)?.bar).toBeNull()
    expect(m.get(2)?.dot).toBeNull()
  })

  it('Shawwal: Eid dotted, the six days left to the month list, the white days as fasts', () => {
    const m = byDay(1448, 10)
    expect(m.get(1)?.dot).toBe('occasion')
    expect(m.get(5)).toEqual({ dot: null, bar: null })
    expect(m.get(14)?.dot).toBe('fast')
  })
})
