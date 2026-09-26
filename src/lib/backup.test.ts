import { describe, expect, it } from 'vitest'
import { applyBackupToSnapshot, validateBackup, type TakrarBackup } from './backup'

function makeBackup(stores: TakrarBackup['stores']): TakrarBackup {
  return { format: 'takrar-backup', version: 1, exportedAt: '2026-01-01T00:00:00.000Z', stores, flags: {} }
}

describe('validateBackup', () => {
  it('rejects non-backup JSON with a friendly message', () => {
    expect(() => validateBackup({ hello: 'world' })).toThrow(/isn't a Takrar backup/)
    expect(() => validateBackup(null)).toThrow(/isn't a Takrar backup/)
    expect(() => validateBackup({ format: 'takrar-backup', version: 99, stores: {} })).toThrow(/Unsupported backup version/)
  })

  it('accepts a well-formed backup', () => {
    expect(validateBackup(makeBackup({}))).toBeTruthy()
  })
})

describe('applyBackupToSnapshot', () => {
  it('restores stores wholesale on a fresh profile (all locals null)', () => {
    const backup = makeBackup({
      'quran-progress': { lessons: { '1-1': { currentPhase: 'complete', completedAt: 111, surahId: 1 } } },
      'quran-settings': { reciter: 'Husary_128kbps', translationEnabled: true },
      'quran-plan': { plan: { id: 'p1', completedLessonIds: ['1-1'] } },
    })
    const merged = applyBackupToSnapshot(backup, {})
    expect(merged['quran-progress']).toEqual(backup.stores['quran-progress'])
    expect(merged['quran-settings']).toEqual(backup.stores['quran-settings'])
    expect(merged['quran-plan']).toEqual(backup.stores['quran-plan'])
  })

  it('an OLDER backup never destroys newer local progress', () => {
    const backup = makeBackup({
      // Backup: lesson 1-1 mid-progress, review card with fewer reps
      'quran-progress': { lessons: { '1-1': { currentPhase: 'understand', completedAt: null, surahId: 1 } } },
      'quran-reviews': {
        cards: [],
        lessonCards: [{ lessonId: '1-1', repetitions: 1, lastReview: 100, interval: 1 }],
      },
      'quran-stats': { currentStreak: 2, longestStreak: 5, totalAyahsMemorized: 10, lastActiveDate: '2026-01-01', activityLog: { '2026-01-01': 1 } },
    })
    const snapshot = {
      // Local: lesson completed since the backup, card with more reps, longer streak
      'quran-progress': { lessons: { '1-1': { currentPhase: 'complete', completedAt: 999, surahId: 1 } } } as Record<string, unknown>,
      'quran-reviews': {
        cards: [],
        lessonCards: [{ lessonId: '1-1', repetitions: 4, lastReview: 900, interval: 7 }],
      } as Record<string, unknown>,
      'quran-stats': { currentStreak: 9, longestStreak: 9, totalAyahsMemorized: 40, lastActiveDate: '2026-02-01', activityLog: { '2026-02-01': 2 } } as Record<string, unknown>,
    }
    const merged = applyBackupToSnapshot(backup, snapshot)

    const lessons = (merged['quran-progress'] as { lessons: Record<string, { completedAt: number | null }> }).lessons
    expect(lessons['1-1'].completedAt).toBe(999) // completion survives

    const lessonCards = (merged['quran-reviews'] as { lessonCards: Array<{ repetitions: number }> }).lessonCards
    expect(lessonCards[0].repetitions).toBe(4) // higher-rep card survives

    const stats = merged['quran-stats'] as { currentStreak: number; totalAyahsMemorized: number; activityLog: Record<string, number> }
    expect(stats.currentStreak).toBe(9) // streak from the more recently active side
    expect(stats.totalAyahsMemorized).toBe(40)
    expect(stats.activityLog).toEqual({ '2026-01-01': 1, '2026-02-01': 2 }) // logs union
  })

  it('merges plan progress as a union of completed lessons', () => {
    const backup = makeBackup({
      'quran-plan': { plan: { id: 'p1', completedLessonIds: ['1-1', '112-1'], lastRevisedAt: { 1: 100 } } },
    })
    const snapshot = {
      'quran-plan': { plan: { id: 'p1', completedLessonIds: ['1-1', '113-1'], lastRevisedAt: { 1: 500 } } } as Record<string, unknown>,
    }
    const merged = applyBackupToSnapshot(backup, snapshot)
    const plan = (merged['quran-plan'] as { plan: { completedLessonIds: string[]; lastRevisedAt: Record<string, number> } }).plan
    expect(new Set(plan.completedLessonIds)).toEqual(new Set(['1-1', '112-1', '113-1']))
    expect(plan.lastRevisedAt['1']).toBe(500) // later revision timestamp wins
  })

  it('restore intent: backup settings replace local settings (documented side-pick)', () => {
    const backup = makeBackup({ 'quran-settings': { reciter: 'Husary_128kbps' } })
    const snapshot = { 'quran-settings': { reciter: 'Alafasy_128kbps' } as Record<string, unknown> }
    const merged = applyBackupToSnapshot(backup, snapshot)
    expect((merged['quran-settings'] as { reciter: string }).reciter).toBe('Husary_128kbps')
  })

  it('ignores store keys not in the known store list', () => {
    const backup = makeBackup({})
    ;(backup.stores as Record<string, unknown>)['evil-store'] = { x: 1 }
    const merged = applyBackupToSnapshot(backup, {})
    expect(Object.keys(merged)).not.toContain('evil-store')
  })
})

describe('backup versioning (review finding)', () => {
  const base = { format: 'takrar-backup' as const, version: 1 as const, exportedAt: '2026-09-26T00:00:00Z', flags: {} }

  it('refuses a store exported by a NEWER app version instead of misreading it', () => {
    const backup: TakrarBackup = { ...base, stores: { 'quran-plan': { plan: null } }, versions: { 'quran-plan': 99 } }
    expect(applyBackupToSnapshot(backup, {})).toEqual({})
  })

  it('normalizes old-format stores on import (stats gain freeze fields)', () => {
    const backup: TakrarBackup = { ...base, stores: { 'quran-stats': { currentStreak: 4 } } }
    expect(applyBackupToSnapshot(backup, {})['quran-stats']).toMatchObject({ currentStreak: 4, streakFreezes: 0, frozenDates: {} })
  })
})
