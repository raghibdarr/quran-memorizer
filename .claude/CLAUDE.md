# Takrar — Quran Memorization App

Guided Quran memorization PWA. Lesson flow: Listen → Understand (word-by-word + waqf-segment
deck) → Build ("chunk": 6-4-4-6 reps per segment with sliced audio, then chaining) → Test →
SM-2 spaced review. Plus: practice mode (self-rated, on-device Whisper voice compare), Hifdh
planner (daily plan), essentials (duas/dhikr), progress stats, streaks.

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, Motion (framer-motion successor)
- Zustand stores persisted to localStorage; IndexedDB (idb-keyval) audio cache
- Supabase: auth (email/Google/magic-link) + cloud sync — per-store JSONB snapshots in a
  `user_data` table, merged per-store in `src/hooks/use-sync.ts`, mounted app-wide via
  `SyncProvider` in `src/components/providers.tsx`
- Backup export/import (signed-out data safety): `src/lib/backup.ts`, UI in settings panel
- **Static export** (`output: 'export'` → `out/`): the SAME bundle is served by Netlify and shipped
  inside the Capacitor iOS/Android apps (`android/`, `ios/`, capacitor.config.ts). Nothing may need a
  server: no middleware, API routes, server actions, or request-time rendering. Every dynamic
  route enumerates params (src/lib/static-params.ts). Lessons are ONE page: `/learn?s=&l=` — build
  lesson URLs only via `lessonHref` (src/lib/routes.ts).
- In-app navigation must be client-side (`<Link>`/router): the native shells answer every
  extensionless path with the ROOT index.html, so a full page load to a deep path renders Home
  (Home recovers via useShellRouteRecovery). Never `<a href="/...">` or `window.location` for app routes.
- Deployed on Netlify. **Pushing main auto-deploys — commit only; push when the owner says.**
- Deploy gate: netlify.toml runs `npm run test:run && npx tsc --noEmit && npm run build`;
  GitHub Actions: ci.yml (tsc, vitest + TZ matrix, dev smoke, static smoke); android.yml
  (debug APK artifact, manual or mobile/** branches)

## Commands
- `npm run dev` — dev server · `npm run build` — production build
- `npm run test:run` — vitest suite (must stay green; deploys depend on it)
- `npm run test:e2e` — Playwright smoke vs dev · `npm run test:e2e:static` — same smoke vs `out/`
  under web AND native-style routing (build first)
- `npm run serve:web` / `serve:native` — serve `out/` like Netlify / like the Capacitor shells
- `npx cap sync` — copy `out/` + plugins into the native projects (after every build)
- `npx tsx scripts/fetch-quran-data.ts` — re-fetch Quran data
- `node scripts/generate-ayah-weights.mjs` — regenerate per-ayah word counts (lesson packing)
- `node scripts/import-segments.mjs <folder>` — import QUL word-timing downloads

## Project Structure
- `src/app/` — routes (home, lesson/[surahId] = surah page, learn = lesson player, juz/[juzNum],
  review, plan/*, essentials, progress, auth). Dynamic routes = server page.tsx (params) +
  *-client.tsx
- `src/components/` — ui/, lesson/phases/, practice/, plan/, layout/, auth/
- `src/stores/` — Zustand: progress, review, settings, stats, practice, plan, essentials
- `src/lib/` — pure logic: audio (playRange = segment slicing), segments (waqf segmentation),
  segment-audio (word timings), curriculum (word-budget lesson packing), spaced-repetition,
  plan, fuzzy (search), backup
- `src/data/` — static JSON: surah data, ayah-weights.json; `public/segments/` — word timings
  (5 reciters; provenance in its manifest.json — CC BY 4.0 attribution required in settings)
- `.claude/plans/` — build-plan.md (ACTIVE roadmap: milestones M0-M11), audit docs, design
  specs. **Read build-plan.md before starting milestone work.**

## Design Tokens ("tactile print")
- Cream #FEFCF9 paper, teal #1B4D5C, gold #C8963E, ink #36332C; 1.5px ink borders; HARD
  offset shadows (no blur); press-collapse physics (.tactile-btn/.tactile-chip/.pressable);
  full dark theme. All in `src/app/globals.css`.
- Arabic: `arabic-text` class (RTL); tajweed via per-word HTML (see SegmentArabic component)
- Tactile treatment is a BUDGET: interactive + hero elements only (see m11 spec)

## Key Conventions
- Mobile-first (375px base); bottom tab nav; M11 (mobile-native elevation + Capacitor store
  launch) is specced in `.claude/plans/m11-mobile-native-spec.md`
- Self-assessment is the source of truth for recall; voice is assistive only
- Never split ayah text at invented points — waqf marks only (src/lib/segments.ts;
  `.claude/plans/ayah-segmentation-waqf.md`)
- Word-audio files are numbered by CONSECUTIVE real-word index (see wordAudioUrl)
- lessonIds are "surahId-lessonNumber" under the word-budget packing (curriculum.ts)

## Reference
- Product spec: `.claude/app-spec-context.md` · Roadmap: `.claude/plans/build-plan.md`
  (supersedes .claude/roadmap.md)
