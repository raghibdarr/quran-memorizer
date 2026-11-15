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

## Second review pass

6. **Engine oddities near the polar circles (`src/lib/prayer/engine.ts`, foundations, not owned here).** With
   `highLatRule: 'auto'` at Longyearbyen (78.22, 15.65): on 2027-02-18 `computeDay` returns Asr on 22 Feb
   (four days away); on 2026-10-20 and 2026-11-01 Asr comes out before Dhuhr; through the polar night
   (Jan to mid Feb) Asr comes out after Maghrib. The planner now leaves out any time more than a day from its
   own day (no alert rather than a wrong one), but the out-of-order Asr still reaches the times screen and the
   alerts. Suggested fix in the engine: return null for Asr when it is not between Dhuhr and Maghrib.
7. **The test alert shares the prayer range** (id 20019), so a replan used to cancel it. The glue now puts a
   still-waiting test alert back after a replan. On iOS with every other range full it is briefly a 65th
   pending notification; the furthest one is dropped by iOS until the next replan (unverified on device).

## UX/UI pass

8. **No button to Takrar's notification settings.** When notifications are off for Takrar the screen now says so
   at the top on every visit (from the probed permission, not just a failed ask) and names where to go, but
   there is no "Open settings" button: neither `@capacitor/local-notifications` nor the spec's `AdhanHealth`
   contract can open the app's notification screen. Suggested for android-native: an
   `AdhanHealth.openNotificationSettings()` (Android `Settings.ACTION_APP_NOTIFICATION_SETTINGS`; iOS
   `UIApplication.openSettingsURLString`), then a button on the notice and the Notifications row.
9. **Icons kept local.** The bell and the "needs attention" circle live in
   `src/components/prayer/alerts/alert-icons.tsx`, since `src/components/ui/icons.tsx` is foundations-only.
   Integration can move them into the shared set.

## Third review pass

10. **What the Android plugin really reports (`@capacitor/local-notifications` 8.3.1, read from its Kotlin source).**
    `getPending()` returns every stored record, including alerts that already rang and still sit in the shade,
    and gives `schedule.at` as Java's `Date.toString()` ("Sat Nov 14 12:41:00 CET 2026"), which JavaScript can't
    parse for zones like CET or BST. The health check's "Set on this phone" row now counts only alerts still
    ahead and takes the last date from the memo when a time can't be read (it used to sit on "Setting them up…").
    The same applies to anything else that reads `getPending()` times on Android.
11. **After a reboot the plugin shows alerts missed while the phone was off**, 15 seconds after boot
    (`LocalNotificationRestoreReceiver`), so a stale "Dhuhr · 12:41" can appear late. Plugin behaviour, not
    changeable from JS; unverified on device.
12. **`Card` drops `data-*` props** (`src/components/ui/card.tsx`, foundations): the screen's `data-alerts-web`,
    `data-alerts-no-place` and `data-alerts-intro` hooks never reached the DOM. They now sit on a wrapper div.
