import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RowTracker } from '@/components/prayer/slots/row-tracker'
import RowTrackerDefault from '@/components/prayer/slots/row-tracker'

// The /prayer row slot (all-in-one spec 3.4): RowTracker({iso, prayer, startMs,
// endMs}). The prayer-times package renders it on each row, so the contract is
// pinned here: what the slot shows for a prayer that has not begun, one that
// has. (Taps and marks are covered in the browser, on the same tick the tracker
// screen uses: a server render only ever sees the store's first state.)

const ISO = '2026-03-10'
const START = Date.UTC(2026, 2, 10, 12, 12)
const END = Date.UTC(2026, 2, 10, 15, 16)

const render = (now: number) => {
  vi.useFakeTimers()
  vi.setSystemTime(now)
  return renderToStaticMarkup(createElement(RowTracker, { iso: ISO, prayer: 'dhuhr', startMs: START, endMs: END }))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('RowTracker slot', () => {
  it('is exported by name and as the default', () => {
    expect(RowTrackerDefault).toBe(RowTracker)
  })

  it('is inert before the prayer begins', () => {
    const html = render(START - 60_000)
    expect(html).toContain(`data-tick="${ISO}:dhuhr"`)
    expect(html).toMatch(/<button[^>]*disabled/)
    expect(html).toContain('aria-label="Dhuhr, Not time yet"')
  })

  it('can be ticked once the prayer has begun, and after its time has ended', () => {
    for (const now of [START, END + 3_600_000]) {
      const html = render(now)
      expect(html).not.toMatch(/<button[^>]*disabled/)
      expect(html).toContain('data-mark="none"')
      expect(html).toContain('aria-label="Dhuhr, not marked yet"')
    }
  })
})
