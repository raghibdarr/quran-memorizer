# HANDOFF: android-native

1. **Push for the compile check (spec 9.6).** Push this branch as `mobile/allinone-native`
   (`git push origin aio/android-native:mobile/allinone-native`) to trigger `.github/workflows/android.yml`
   (assembleDebug). Merge only after that run is green. Nothing here was compiled locally (no JDK or Android SDK).
2. **Optional, `src/lib/native-plugins.ts` (foundations-owned):** add `prayerTz?: string` to
   `TakrarWidgetData` with the comment "IANA zone of the place, so the widget shows times as the app
   does". `widget-sync.tsx` already sends it through a local `WidgetPayload` type, so nothing breaks without it.
3. **Integration:** regenerate `public/licenses.txt` (picks up `data-sources/licenses.d/25-chime.txt`) and run
   `npx cap sync` (the new raw resource and the AdhanHealth plugin need no plugin-list change: they are app-local).
4. **Local builds in a worktree:** Turbopack refuses the `node_modules` junction ("points out of the filesystem root");
   `npx next build --webpack && node scripts/flatten-segments.mjs` works.
