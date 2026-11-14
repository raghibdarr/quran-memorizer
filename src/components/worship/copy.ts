// Every user-facing line on the tasbih and prayer log screens, in one place so
// the copy test (copy.test.ts) can hold it to the calm-wording rule (spec 1.6,
// 7): no streak talk that scolds, nothing about what was "missed" beyond the
// one plain option label a user picks for themselves.

import type { PrayerMark } from '@/stores/worship-store';

export const MARK_LABELS: Record<PrayerMark, string> = {
  ontime: 'On time',
  late: 'Late',
  missed: 'Missed',
};

export const TRACKER_COPY = {
  title: 'Prayer log',
  todayHeading: 'Today',
  todayHint: "Tap a prayer once you've prayed it. Hold it for more choices.",
  noPlaceHint: 'Set your place on the Prayer screen to see times here.',
  setPlace: 'Set your place',
  clear: 'Clear',
  notYet: 'Not time yet',
  notMarked: 'not marked yet',
  tickAria: (prayer: string, state: string) => `${prayer}, ${state}`,
  sheetHint: 'Choose how to log it.',
  dayHint: 'Tap a choice to log it, or tap it again to clear it.',
  weekHeading: 'Last 7 days',
  weekNone: 'Nothing logged yet this week.',
  weekPrayed: (n: number) => `${n} prayed`,
  weekOnTime: (n: number) => `${n} on time`,
  run: (n: number) => `All five, ${n} days running`,
  monthPrev: 'Previous month',
  monthNext: 'Next month',
  monthHint: 'Tap a day to fill it in.',
  legendOnTime: 'On time',
  legendLate: 'Late',
  legendPaused: 'Paused',
  dayLogged: (n: number) => (n === 0 ? 'nothing logged' : `${n} of 5 logged`),
  dayPaused: 'Tracking was paused on this day, so it stays out of every count.',
  pauseHint: 'For travel, illness, or any stretch you would rather not log. No reason needed.',
  pauseAction: 'Pause tracking',
  pausedSince: (date: string) => `Paused since ${date}`,
  pausedHint: 'Days while paused stay out of every count.',
  resume: 'Resume',
  makeUpHeading: 'Make-up prayers (qada)',
  makeUpHint: 'Prayers you mark "Missed" gather here, so you can make them up in your own time.',
  makeUpCount: (n: number) => (n === 1 ? '1 to make up' : `${n} to make up`),
  makeUpDone: 'All made up.',
  madeOneUp: 'Made one up',
  undo: 'Undo',
  fromDays: 'Marked on',
} as const;

export const TASBIH_COPY = {
  title: 'Tasbih',
  free: 'Free count',
  targetHeading: 'Count to',
  noTarget: 'None',
  custom: 'Other',
  customLabel: 'Your own target',
  customApply: 'Set',
  tapHint: 'Tap anywhere on the counter',
  reachedTarget: 'Target reached. Keep going if you like.',
  undo: 'Undo',
  reset: 'Start again',
  resetTitle: 'Start again from zero?',
  resetMessage: 'This count goes back to 0. Your lifetime total stays.',
  resetConfirm: 'Start again',
  lifetime: (n: string) => `${n} in all`,
  fromEssentials: 'Dhikr from Essentials',
  countOf: (count: number, target?: number) => (target ? `${count} of ${target}` : `${count}`),
} as const;
