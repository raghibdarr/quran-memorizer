import { describe, expect, it } from 'vitest'
import { isAppRoute, lessonHref, normalizeAppUrl, safeFromPath } from './routes'

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

describe('native-shell routing guards (review findings)', () => {
  it('drops trailing slashes (a slashed path fetches a missing …/index.txt)', () => {
    expect(normalizeAppUrl('/lesson/112/')).toBe('/lesson/112')
    expect(normalizeAppUrl('/review/?start=1')).toBe('/review?start=1')
    expect(normalizeAppUrl('/')).toBe('/')
  })

  it('isAppRoute accepts exported pages only (anything else would reload-loop)', () => {
    for (const ok of ['/', '/learn', '/lesson/1', '/lesson/114', '/juz/30', '/plan/revise/78', '/essentials/tasbih', '/plan/setup']) {
      expect(isAppRoute(ok), ok).toBe(true)
    }
    for (const bad of ['/lesson/0', '/lesson/115', '/juz/31', '/plan/revise/999', '/nope', '/lesson/112/1', '/lesson/abc']) {
      expect(isAppRoute(bad), bad).toBe(false)
    }
  })

  it('safeFromPath refuses off-site and unknown back links', () => {
    expect(safeFromPath('juz/5')).toBe('juz/5')
    expect(safeFromPath('/evil.com')).toBeNull()
    expect(safeFromPath('evil.com')).toBeNull()
    expect(safeFromPath('juz//5')).toBeNull()
    expect(safeFromPath(null)).toBeNull()
  })
})
