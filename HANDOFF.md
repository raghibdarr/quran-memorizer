# HANDOFF: prayer-alerts

Nothing in a shared file is required for this package to build or pass. Two notes for the orchestrator:

1. **Existing hifz reminders and exact alarms (`src/lib/reminder-notifications.ts`, not owned here).**
   `@capacitor/local-notifications` 8.3 defaults `isExactNotification` to `true`. On Android 12+ without the
   exact-alarm grant, `schedule()` then opens the system "Alarms and reminders" screen on every call.
   Once android-native declares `SCHEDULE_EXACT_ALARM`, `applyReminders` would do that on every app open for a
   user who hasn't granted it. Suggested fix (one line in the notification object):
   `isExactNotification: false` (a daily nudge doesn't need the minute). Prayer alerts already set it from
   `checkExactNotificationSetting()`, so they never open the screen by themselves.

2. **Notification taps.** Prayer alerts carry `extra.url` (`/prayer`, the test alert `/prayer/alerts`).
   ReminderSync's existing `onReminderTap` listener routes any notification with an `extra.url`, so
   PrayerSync adds no second listener. If ReminderSync ever stops being mounted app-wide, move that listener.

Local builds in this worktree: Turbopack refuses the `node_modules` junction, so `npx next build --webpack`
(with placeholder `NEXT_PUBLIC_SUPABASE_*` values; without them the static pages throw on load).

## Review pass (fresh reviewer)

3. **"Erase everything on this device" (`src/components/layout/erase-device.tsx`, not owned here)** wipes
   localStorage but not the alarms the OS holds. PrayerSync now looks once per app run and clears left-behind
   prayer alerts (ids 20000-21000), so nothing is needed there for prayer; other features that schedule
   (adhkar 22000+, reminders 22100+) need their own clean-up or a `LocalNotifications.cancel` in the erase flow.
4. **Churn.** A plan drops each alert as it passes, so its hash changes after every prayer and the next open
   cancels and re-sets the whole range (about 150-310 alarms on Android). Correct, but if it shows up as lag on
   a slow phone, `applyRange` (foundations) could diff by id instead of replacing the range.
5. **Delivered alerts pile up in the tray** (each has its own id; a heads-up stays beside its prayer). Possible
   follow-up: `removeDeliveredNotifications` for older prayer ids on app open.
