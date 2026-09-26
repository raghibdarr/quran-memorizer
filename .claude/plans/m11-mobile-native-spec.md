# M11 — Mobile-Native Elevation & Store Launch (Design Spec)

**Status: direction APPROVED by owner 2026-07-12.** The approved interactive mockup is
committed at `.claude/plans/assets/m11-approved-mockup.html` (self-contained; open in a
browser at phone size) — it IS the spec for look/feel; this document is the written contract.
Origin: owner override in `build-plan.md` decision 2 (store launch is a growth requirement);
direction chosen from a two-direction ultracode exploration.

## 1. The approved direction

**"Native Stack" (Direction A) + two paper accents from Direction B:**
- A's navigation skeleton: persistent 4-tab bottom bar (Home / Review / Essentials /
  Progress), each tab owning a screen stack; details/flows PUSH with a flat parallax slide
  (~320ms `cubic-bezier(.32,.72,0,1)`): incoming slides from the right, outgoing recedes to
  ~-28% under a scrim; tab bar slides away for full-screen flows; back = 44px chevron OR
  interactive left-edge swipe (finger-tracked, velocity-based commit/cancel); large-title
  headers collapse to a blurred compact bar on scroll; every picker/panel/confirm/celebration
  becomes a grabber-handle bottom sheet (spring in, drag-to-dismiss, scrim tap).
- B accent 1 — **dealt-in lists**: list rows enter staggered (~46ms apart) with a small
  alternating tilt (±1.5° in the mockup — see "dials" below) that settles straight.
  First-paint and tab-switch only; scrolling is a plain list.
- B accent 2 — **gliding paper-chip tab indicator**: the active tab sits on a small raised
  tactile chip (ink border + hard 2px shadow) that GLIDES between tab slots on switch
  (~420ms `--spring-pop` overshoot) instead of the highlight teleporting.
- REJECTED from B (owner, explicitly): whole-screen rotation on navigation ("gimmicky").
  No screen-level card dealing, no toss-to-go-back rotation.

## 2. Owner's watch-item: neubrutalism density ("tactile budget")

The owner flagged possible over-leaning into neubrutalism. Rule for implementation:
**the tactile treatment (ink border + hard offset shadow) is a budget, not a default.**
- Treatment belongs on: interactive elements (buttons, chips, tab chip), hero cards
  (plan card, deck cards), and one primary container per screen.
- Quiet surfaces (secondary list rows, section wrappers, informational text blocks) get
  at most a hairline border or nothing — flat cream. If everything is raised, nothing is.
- The mockup applies the treatment at demo density; production should be one notch quieter.
- **Checkpoint (required):** after the first screen batch (Home + one pushed flow) lands,
  the owner reviews on-device and the dials below get tuned BEFORE rolling to other screens.

**Dials (single-number tunables, list them in code as constants):** deal tilt (±1.5° mockup →
try ±0.8-1° production), deal travel (20px), stagger step (46ms), push duration (320ms),
parallax depth (-28%), scrim opacity, chip glide duration (420ms), tactile-budget tier
per component.

## 3. Motion tokens (one language, two curves)

- `--nav-ease: cubic-bezier(.32,.72,0,1)` @ 320ms — all screen-level travel (push/pop,
  tab-bar hide).
- `--spring-pop: cubic-bezier(.34,1.45,.64,1)` @ 300-420ms — element-level moments (chip
  glide, sheet settle, switch knobs, bead-pop, tab icon).
- `--spring-settle: cubic-bezier(.22,1.2,.36,1)` @ 460ms — entrances (dealt lists).
- Press feedback: keep the existing 120ms tactile physics everywhere.
- Transform + opacity ONLY. Gestures track the finger 1:1 with transitions disabled, then
  commit/cancel on release by distance + velocity. `prefers-reduced-motion` collapses all
  of the above to instant state changes (CSS **and** JS handlers).

## 4. Work checklist — the audit's hard findings (all must close)

Navigation & structure:
- [ ] No screen transitions exist; navigation is plain `<a href>` full reloads (white flash)
      — providers.tsx:115, bottom-nav.tsx. Build the stack/transition layer (View
      Transitions API or client stack) + swap anchors for client nav.
- [ ] Review session, practice selection→session, juz practice are useState "views", not
      routes (review/page.tsx:29, practice-container) — convert to routed screens so back
      /swipe-back/state restoration work.
- [ ] Back model is inconsistent hardcoded hrefs (lesson/[surahId]/page.tsx:51) — one
      in-app back model (stack pop; router.back with fallback).
- [ ] Settings is a desktop popover anchored via getBoundingClientRect
      (settings-panel.tsx:78-107) — becomes a bottom sheet.
- [ ] All confirm/auth/celebration modals are centered desktop overlays (auth-modal.tsx:125,
      lesson-complete) — become sheets (or full-screen where appropriate).
- [ ] Two stacked sticky bars with hardcoded top-14 offset (lesson/[surahId]/page.tsx:79,
      juz/[juzNum]/page.tsx) — restructure with the collapsing-header pattern.

Ergonomics & correctness:
- [ ] Sub-44px touch targets: settings gear h-8 (32px), steppers (settings-panel.tsx:94,
      148,158,205,215), others — sweep every control to >=44px hit area.
- [ ] `min-h-screen`(=vh) everywhere + `max-h-[80vh]` panels — migrate to dvh/svh
      (page.tsx:174, lesson-container.tsx:158, review/page.tsx...).
- [ ] Safe-area top is unhandled (headers use pt-6; fine in browser, wrong in the Capacitor
      shell) — env(safe-area-inset-top) on headers; audit all fixed elements.
- [ ] Inputs are text-sm (14px) → iOS zoom-on-focus (page.tsx:313, auth-modal.tsx:236) —
      16px minimum on all inputs.
- [ ] No overscroll-behavior / touch-action tuning anywhere — add per scroll container.

Motion & feedback:
- [ ] Zero prefers-reduced-motion support in the whole app — global CSS guard + JS checks.
- [ ] All loading states are spinners — replace with ink-border skeleton + gold shimmer
      (auth/callback:40, essentials/[collectionId]:67, review...).
- [ ] No list entrance animations — implement dealt-in lists (accent 1) app-wide via one
      shared utility.
- [ ] Press feedback gaps: settings steppers, media-controls-bar, misc touchables lack
      tactile/pressable classes — full coverage sweep.
- [ ] Springs only exist on the word deck — apply the token set above app-wide.
- [ ] Tab indicator: build the gliding paper chip (accent 2) in bottom-nav.

## 5. Sub-milestones (sized like the rest of the build plan)

- **M11a — Capacitor device spike (1 session, FIRST):** wrap the current app unchanged,
  run on the owner's real phone (Android APK sideload and/or iOS via Xcode). Purpose:
  settle the "can web feel native" question with thumbs before further investment, and
  surface shell issues (safe areas, status bar, audio, SW) early. Includes disabling the
  WKWebView native swipe-back (conflicts with our edge-swipe).
- **M11b — Navigation shell (2-3 sessions):** stack/transition layer, routed sessions,
  one back model, tab-bar hide, edge-swipe-back. The structural core and biggest risk.
- **M11c — Sheets & ergonomics (2 sessions):** BottomSheet component (grabber, springs,
  drag-dismiss); migrate settings/auth/confirms/celebrations; touch-target + dvh +
  safe-area + input-size + overscroll sweeps.
- **M11d — Motion & accents (1-2 sessions):** skeletons, dealt lists, gliding chip,
  press-coverage sweep, reduced-motion, collapsing headers. Ends with the OWNER
  CHECKPOINT (tactile-budget + dial tuning) before app-wide rollout.
- **M11e — Store packaging (2-3 sessions):** icons/splash, native haptics on press
  physics (Capacitor Haptics — a natural fit for tactile-print), store listings,
  signing, TestFlight/internal track, release checklist.

Sequencing vs the main plan: M11a can run ANY time (zero code change). M11b-e should
follow M0 (deploy gate + data safety) at minimum — a store launch multiplies users of
whatever data-loss windows remain. Owner prioritizes the rest of the interleave.

## 5a. Packaging architecture (added 2026-09-26, from a codebase survey)

**M11a STATUS: ✅ CODE SPIKE DONE 2026-09-26 — device run pending (owner).** What landed:
static export (47 MB / 3,305 files — was 160 MB / 25,888 before lessons moved to one `/learn`
page); middleware + dead server auth removed; 5 dynamic routes split server-params/client;
Suspense for search-param pages; 30 `<a href>` → `<Link>` and every `window.location` nav → router;
Home route-recovery for the native root-index fallback (+ legacy `/lesson/<s>/<l>` normalizer and
Netlify 301); Next 16.1.6 → 16.3.6; post-build `flatten-segments` fixing a WINDOWS-ONLY Next static-export
segment-prefetch 404 bug (path.relative backslashes; Linux/Netlify/CI builds are unaffected); Capacitor 8 android/ + ios/ (SPM, no CocoaPods),
SystemBars insets 'native', splash hide-on-mount, status bar follows the app theme, mic permission
strings; `serve-static.mjs` emulating Netlify AND Capacitor routing; smoke green on dev + web + native;
android.yml builds a debug APK. Found + fixed en route: the Whisper worker shipped as raw
TypeScript (the bundler copied `new URL('@/lib/…ts')` verbatim) — voice check could never load in
production; now plain JS in `public/workers/`.
Still owed from the original M11a scope (needs a device): thumbs-on feel check, audio playback in
the WebView, mic prompt, safe areas on a notched phone.

**Decision: bundle a static export inside the native shell; do NOT point Capacitor at the live URL.**
A remote-URL wrapper fails offline, flashes white on launch, and is the classic App Store 4.2
("minimum functionality / repackaged website") rejection. A bundled build is offline-first by
construction and is the same artifact the web deploy serves (one truth for web + native).

Why it's feasible here (verified):
- No API routes; no Server Actions; all Quran data is client-imported JSON chunks (`quran-data.ts`).
- `src/lib/supabase/server.ts` has **zero importers** and the browser client keeps its session in
  localStorage, so `middleware.ts` (a cookie refresh "for Server Components") is dead weight — delete it.

What the spike must change / measure:
1. `next.config`: `output: 'export'`, `images.unoptimized`, `trailingSlash: true`.
2. Dynamic routes need `generateStaticParams`, which can't live in `'use client'` files → split
   each into a server `page.tsx` (params) + client component. Counts: surah 114, juz 30,
   revise 114, essentials collections, and **lesson/[surahId]/[lessonNum] ≈ 2,259 pages** — measure
   the export size. Fallback if too heavy: move lesson number to a query param
   (`/lesson/112/?l=1` under the surah route) so it's 114 pages.
3. `useSearchParams` pages (review, surah detail) need `<Suspense>` boundaries for export.
4. Service worker: skip registration inside Capacitor (assets are already local; the existing
   `hostname === 'localhost'` guard already covers both shells — make it explicit via
   `Capacitor.isNativePlatform()`).
5. Netlify: publish `out/` as static (drop the Next runtime plugin); SPA-style 404 handling.
6. Capacitor: `@capacitor/core`, `cli`, `android`, `ios`; `webDir: 'out'`; generate `android/` and
   `ios/` projects; disable WKWebView's native swipe-back (conflicts with M11b edge-swipe).

**Build tooling reality (owner's machine is Windows; no JDK / Android SDK / Xcode present):**
- Android: a GitHub Actions job builds a debug APK on ubuntu (SDK preinstalled) and uploads it as
  an artifact for sideloading — OR the owner installs Android Studio locally. Either needs an owner OK
  (the CI route means pushing a non-main branch; that does not trigger a Netlify production deploy).
- iOS: requires macOS. Options: a macOS GitHub Actions runner + fastlane (needs Apple Developer
  account secrets for device/TestFlight builds), or any Mac with Xcode. Simulator-only builds need no account.

## 5b. Store compliance checklist (added 2026-09-26 — none of these exist yet)

- [ ] **In-app account deletion** — required by Apple 5.1.1(v) and Google Play. Plan: a
      `security definer` SQL function `delete_my_account()` (deletes `auth.users` where id = auth.uid();
      `user_data` cascades) + a confirm sheet in settings. Migration 003, owner applies.
- [ ] **Privacy policy page** — both stores require a URL. Static `/privacy` route: local-first
      storage, optional Supabase sync, mic audio processed on-device (Whisper), no ads/tracking.
- [ ] **Native OAuth** — Google blocks sign-in inside embedded WebViews (`disallowed_useragent`).
      Use `@capacitor/browser` + a custom-scheme deep link back into the app + `exchangeCodeForSession`.
      Magic links need the same deep-link handling.
- [ ] **Apple 4.8** — offering Google sign-in on iOS requires also offering Sign in with Apple.
      Owner decision: add Apple sign-in (Supabase supports it; needs Apple Developer config) or hide
      Google on iOS and keep email/password + magic link.
- [ ] Permission strings: `NSMicrophoneUsageDescription` (voice check) / Android `RECORD_AUDIO`;
      notification permission (M8).
- [ ] Icons (adaptive Android, full iOS set), splash, status-bar styling, app name + bundle id
      (bundle id is permanent after first upload — owner confirms before M11e).
- [ ] Store listings, screenshots, Play data-safety form, App Privacy labels, content rating.
- [ ] OWNER: Apple Developer Program ($99/yr), Google Play Console ($25 once), signing keys.

## 6. Known risks (from the direction's own tradeoffs)

1. Stack navigation on Next.js App Router is the hard part (keeping the parent mounted,
   scroll restoration, App Router semantics) — M11b is a structural refactor, not a reskin.
2. Edge-swipe-back vs horizontally swipeable content (word deck, recite-mode) — reserve a
   ~26px left gutter and arbitrate gestures; disable the WKWebView native gesture.
3. Parallax push keeps two screens alive — heavy tab roots must stay cheap to paint on
   low-end Android.
4. Bottom sheets add scrim/focus management; deep-linking modal states needs care.
5. The dealt-list tilt and chip are personality on a razor's edge — that's what the
   dials + owner checkpoint are for.
