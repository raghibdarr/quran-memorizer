import { describe, expect, it } from 'vitest'
import { heatmapCells, hijriSpan } from './calendar-heatmap'
import { monthGrid } from '@/lib/hijri/calendar'
import { toHijri } from '@/lib/hijri/convert'

describe('Progress calendar Hijri days', () => {
  it('agree with the /calendar grid for a sample month, offset included', () => {
    for (const offset of [0, 1, -1]) {
      const cells = heatmapCells(2026, 10, { activityLog: {}, today: '2026-11-15', hijriOffset: offset, weekStart: 1 })
      // Every day of November 2026, looked up in the Hijri grids /calendar draws
      for (const c of cells.filter((x) => x.day !== null)) {
        const h = toHijri(c.date, offset)
        const grid = monthGrid({ year: h.year, month: h.month }, { offset })
        const day = grid.days.find((d) => d.iso === c.date)
        expect(day?.hijri.day, `${c.date} offset ${offset}`).toBe(c.hijriDay)
      }
    }
  })

  it('15 November 2026 is 5 Jumada al-Akhirah 1448, as on the Prayer hub', () => {
    const cells = heatmapCells(2026, 10, { activityLog: {}, today: '2026-11-15', hijriOffset: 0, weekStart: 1 })
    expect(cells.find((c) => c.date === '2026-11-15')?.hijriDay).toBe(5)
    expect(hijriSpan(cells, 0)).toContain('Jumada al-Akhirah')
    expect(hijriSpan(cells, 0)).not.toContain('Thani')
  })

  it('leading blanks follow the week start', () => {
    // 1 November 2026 is a Sunday
    expect(heatmapCells(2026, 10, { activityLog: {}, today: '', hijriOffset: 0, weekStart: 0 })[0].day).toBe(1)
    expect(heatmapCells(2026, 10, { activityLog: {}, today: '', hijriOffset: 0, weekStart: 1 }).findIndex((c) => c.day === 1)).toBe(6)
  })
})
