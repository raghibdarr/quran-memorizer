import { describe, expect, it } from 'vitest'
import { isFullScreenFlow, navTransitionTypes, routeDepth, NAV_BACK, NAV_FORWARD, NAV_TAB } from './nav'

describe('navigation grammar', () => {
  it('assigns depths: tab roots, section details, flows', () => {
    expect(['/', '/review', '/essentials', '/progress'].map(routeDepth)).toEqual([0, 0, 0, 0])
    expect(['/lesson/112', '/juz/30', '/plan', '/essentials/tasbih'].map(routeDepth)).toEqual([1, 1, 1, 1])
    expect(['/learn?s=1&l=1', '/plan/revise/78', '/plan/setup', '/plan/edit', '/review/session?stream=sabqi'].map(routeDepth))
      .toEqual([2, 2, 2, 2, 2])
  })

  it('deeper = push, shallower = pop, tab to tab = crossfade', () => {
    expect(navTransitionTypes('/', '/lesson/112')).toEqual([NAV_FORWARD])
    expect(navTransitionTypes('/lesson/112', '/learn?s=112&l=1')).toEqual([NAV_FORWARD])
    expect(navTransitionTypes('/learn?s=112&l=1', '/lesson/112')).toEqual([NAV_BACK])
    expect(navTransitionTypes('/plan/revise/78', '/')).toEqual([NAV_BACK])
    expect(navTransitionTypes('/', '/progress')).toEqual([NAV_TAB])
    expect(navTransitionTypes('/review', '/review/session?stream=sabqi')).toEqual([NAV_FORWARD])
  })

  it('same path (e.g. only the query changes) animates nothing', () => {
    expect(navTransitionTypes('/learn?s=1&l=1', '/learn?s=1&l=2')).toEqual([])
    expect(navTransitionTypes('/lesson/112/', '/lesson/112')).toEqual([])
  })

  it('flows hide the tab bar', () => {
    expect(isFullScreenFlow('/learn?s=1&l=1')).toBe(true)
    expect(isFullScreenFlow('/lesson/112')).toBe(false)
  })
})
