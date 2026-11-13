# HANDOFF: zakat

Requests for the orchestrator or integration. The package builds and passes without any of them.

1. **Shared reminders range (22100-22109).** The hawl reminder calls `applyRange(NOTIFY_RANGES.reminders, …)` with id 22100. `applyRange` cancels everything pending in a range, so if another package later schedules fasting reminders in the same range with its own `applyRange` call, the two will cancel each other. Fix before that lands: either split the range in `src/lib/notify/registry.ts` (for example `hawl: 22100-22101`, `fasting: 22102-22109`, iOS slots 1 and 3), or have one planner own the whole range. Today only zakat uses it.
2. **Yearly re-arm (optional).** The reminder is scheduled from the `/zakat` screen (on open and on every change). After it fires, next year's reminder is scheduled the next time the user opens `/zakat`. If the owner wants it re-armed without opening the screen, mount a tiny sync (`syncHawlReminder` from `src/lib/zakat/reminder.ts`, reading `useZakatStore` and `usePrayerStore.hijriOffset`) in `providers.tsx`.
3. **Licensing.** Nothing new: the zakat notes are our own work and there is no data source. No `licenses.d` fragment.
4. **Build note.** `npm run build` (Turbopack) fails in this worktree only because `node_modules` is a junction outside the worktree ("Symlink … points out of the filesystem root"). `npx next build --webpack` builds fine. This is the worktree setup, not the package.
