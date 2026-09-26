import { describe, expect, it } from 'vitest'
import { lessonHref, normalizeAppUrl } from './routes'

describe('lesson routes', () => {
  it('builds the single-page lesson URL', () => {
    expect(lessonHref(112, 1)).toBe('/learn?s=112&l=1')
    expect(lessonHref(2, 40, 'juz/2')).toBe('/learn?s=2&l=40&from=juz%2F2')
  })

  it('normalizes legacy /lesson/<s>/<l> URLs (synced lastActivity, bookmarks)', () => {
    expect(normalizeAppUrl('/lesson/112/1')).toBe('/learn?s=112&l=1')
    expect(normalizeAppUrl('/lesson/112/1/')).toBe('/learn?s=112&l=1')
    expect(normalizeAppUrl('/lesson/2/40?from=juz/2')).toBe('/learn?s=2&l=40&from=juz%2F2')
  })

  it('leaves every other URL alone — including the surah detail page', () => {
    expect(normalizeAppUrl('/lesson/112')).toBe('/lesson/112')
    expect(normalizeAppUrl('/plan/revise/78')).toBe('/plan/revise/78')
    expect(normalizeAppUrl('/learn?s=1&l=1')).toBe('/learn?s=1&l=1')
  })
})
