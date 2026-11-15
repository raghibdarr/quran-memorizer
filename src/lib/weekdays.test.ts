import { describe, expect, it } from 'vitest'
import { DEFAULT_WEEK_START, localeWeekStart, weekColumn, weekdayLabels, weekdayOfIso } from './weekdays'

describe('weekdays', () => {
  it('labels rotate from the first day', () => {
    expect(weekdayLabels(1)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(weekdayLabels(0)[0]).toBe('Sun')
    expect(weekdayLabels(6)[0]).toBe('Sat')
  })
  it('columns follow the first day', () => {
    // 15 November 2026 is a Sunday
    expect(weekdayOfIso('2026-11-15')).toBe(0)
    expect(weekColumn(0, 1)).toBe(6)
    expect(weekColumn(0, 0)).toBe(0)
    expect(weekColumn(1, 6)).toBe(2)
  })
  it('reads the locale when the platform says, else Monday', () => {
    const us = localeWeekStart('en-US')
    expect([0, DEFAULT_WEEK_START]).toContain(us)
    expect(localeWeekStart('de-DE')).toBe(1)
    expect(localeWeekStart('not a locale!')).toBe(DEFAULT_WEEK_START)
  })
})
