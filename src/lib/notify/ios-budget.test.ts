import { describe, expect, it } from 'vitest'
import { planReminders, type ReminderState } from '@/lib/reminders'
import { planPrayerAlerts } from '@/lib/prayer/schedule'
import { planAdhkarReminders } from '@/components/adhkar/reminders'
import { planHawlReminder } from '@/lib/zakat/hawl'
import { IOS_PENDING_LIMIT, NOTIFY_RANGES, rangeOf } from './registry'
import { PRAYER_NAMES, type PrayerAlert, type PrayerName } from '@/types/prayer'
import type { LessonProgress } from '@/types/quran'

// Spec 3.6: iOS keeps at most 64 pending local notifications per app. With every
// scheduling feature switched on at once (hifz reminders, prayer alerts with
// heads-ups, morning and evening adhkar, the hawl reminder), the planned set
// must still fit, and each feature must stay inside its own id range.

const NOW = new Date(2026, 10, 15, 0, 30).getTime()

function hifzReminders() {
  const state: ReminderState = {
    now: NOW,
    time: { hour: 20, minute: 0 },
    plan: null,
    planLessons: [],
    // A lesson left mid-way, so every day has something to say
    progressLessons: { '1-1': { lessonId: '1-1', surahId: 1, startedAt: NOW - 86_400_000, completedAt: null } as unknown as LessonProgress },
    lessonCards: [],
    allSurahs: [],
    todayDone: false,
    streak: 0,
  }
  return planReminders(state)
}

function prayerAlerts() {
  const alerts = Object.fromEntries(
    PRAYER_NAMES.map((p) => [p, { mode: 'default', preAlertMin: 15 } as PrayerAlert]),
  ) as Record<PrayerName, PrayerAlert>
  const plan = planPrayerAlerts({
    now: NOW,
    place: { lat: 51.51, lng: -0.13, tz: 'Europe/London' },
    settings: {
      method: 'MuslimWorldLeague',
      madhab: 'standard',
      highLatRule: 'auto',
      offsets: { fajr: 0, sunrise: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 },
      alerts,
    },
    platform: 'ios',
  })
  return [...plan.alerts, ...(plan.tail ? [plan.tail] : [])]
}

describe('iOS pending budget with everything switched on', () => {
  const hifz = hifzReminders()
  const prayer = prayerAlerts()
  const adhkar = planAdhkarReminders({ morning: { on: true, time: '06:30' }, evening: { on: true, time: '17:30' } })
  const hawl = planHawlReminder({ enabled: true, hawlStartIso: '2026-03-01', now: new Date(NOW) })

  it('every feature plans something, so the sum is a real worst case', () => {
    expect(hifz.length).toBeGreaterThan(0)
    expect(prayer.length).toBeGreaterThan(40)
    expect(adhkar).toHaveLength(2)
    expect(hawl).toHaveLength(1)
  })

  it('the planned iOS pending set is at most 64', () => {
    const total = hifz.length + prayer.length + adhkar.length + hawl.length
    expect(total).toBeLessThanOrEqual(IOS_PENDING_LIMIT)
  })

  it('each feature stays inside its own range and its iOS slots', () => {
    const check = (ids: number[], name: keyof typeof NOTIFY_RANGES, slots: number) => {
      for (const id of ids) expect(rangeOf(id)?.name, `id ${id}`).toBe(name)
      expect(ids.length).toBeLessThanOrEqual(slots)
    }
    check(hifz.map((n) => n.id), 'hifz', NOTIFY_RANGES.hifz.iosSlots)
    const prayerIds = prayer.map((n) => n.id)
    for (const id of prayerIds) expect(['prayer', 'prayerTail']).toContain(rangeOf(id)?.name)
    expect(prayerIds.length).toBeLessThanOrEqual(NOTIFY_RANGES.prayer.iosSlots + NOTIFY_RANGES.prayerTail.iosSlots)
    check(adhkar.map((n) => n.id), 'adhkar', NOTIFY_RANGES.adhkar.iosSlots)
    check(hawl.map((n) => n.id), 'reminders', NOTIFY_RANGES.reminders.iosSlots)
  })

  it('no two features share an id', () => {
    const ids = [...hifz, ...prayer, ...adhkar, ...hawl].map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
