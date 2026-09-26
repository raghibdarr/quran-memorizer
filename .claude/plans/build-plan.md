# Takrar Build Plan — Foundation-First

**Status: ACTIVE. This document supersedes `.claude/roadmap.md`** — when they disagree, this plan wins. It is derived from `.claude/plans/audit-ux-flows.md` (UX audit) and `.claude/plans/audit-features-architecture.md` (feature/architecture audit); consult those for full finding details behind any anchor cited here.

## 1. How to use this plan

Work one milestone per session-block with Claude Code (each is sized 1–3 focused sessions); every milestone is self-contained — goal, file pointers, acceptance criteria, and verification are all inline, no need to read this conversation's history or the whole plan first. Do milestones in order (the ordering encodes hard dependencies); commit only, **never push main unprompted** (main auto-deploys to Netlify).

## 2. Sequencing rationale

Ordering is by irreversible-failure risk for public users, then severity, then dependency:
1. **Stop active data loss before touching anything** (M0): a sync hook that never runs on some routes and no backup path for signed-out users are open loss windows *today*; export/import must exist before any migration can be attempted safely.
2. **Bank the cheap wins early** (M1) per owner directive — 15 independent S-effort fixes, three of which are also foundation bricks.
3. **Harden the untested 633-line sync merge before any store shape changes** (M2), because M3–M7 all change shapes and one merge bug corrupts data locally *and* cross-device.
4. **One coherent time model** (M3) before anything that reads "today" — blocker fix, tiers, habit loop, lapse recovery, reminders all depend on it.
5. **The sole BLOCKER (known-surah hafiz) lands the moment it's safe** (M4): seeding whole-juz card data through an untested merge would have been tech-debt #1's exact failure mode, so it waits for M2/M3 — then flood caps (M5) land immediately adjacent, before persona-C users can hit uncapped queues.
6. **Habit loop (M6) → lapse recovery (M7) → reminders (M8)** in that strict order: a push notification must point at a truthful "done today" and land returners in triaged re-entry, not a 34-card flood — the notification permission is one-shot and a bad first impression burns it forever.
7. **Beginner redesign (M9) and drills (M10) last** — not least important, but their core work needs the M2 regression net (1152-line chunk-phase refactor) and M9's WordText respectively; M1 already blunted persona A's sharpest edges.

### 2a. Revised sequencing — 2026-09-26 (owner: "finish the project end to end, mobile included")

State at resumption: M0–M4 ✅ committed on local `main`, **none pushed** (live site = 2026-07-12 build). Remaining: M5–M10 + M11a–e.

The owner's mobile priority is folded in by interleaving M11 rather than appending it. Order of work:

1. **M11a — static export + Capacitor scaffold (code spike)**, moved to FIRST. The real technical risk
   is not "can a WebView feel native" but "does this Next.js app export statically": every later
   milestone must stay export-compatible, so learn it now while it's cheap. Detail: m11 spec §7.
2. **M5 — retention engine v2.** Overdue: M4's seeding must not reach users without M5's caps (risk #3).
3. ⛳ **Owner checkpoint A (async — work continues on local main):** push decision for M0–M5,
   apply migration 002, signed-in sync spot-checks, sideload the debug APK.
4. **M6 habit loop → M7 lapse recovery** (unchanged order; M6 badging gets a native path too).
5. **M11b nav shell → M11c sheets & ergonomics → M11d motion & accents** — pulled ahead of M8–M10
   so welcome-back, drill and reminder screens are born inside the native stack instead of retrofitted.
   ⛳ **Owner checkpoint B** (required by the M11 spec: on-device tactile-budget + dial tuning).
   Non-blocking: M8–M10 proceed on default dials meanwhile.
6. **M8 reminders — REVISED:** the store app uses on-device **local notifications**
   (`@capacitor/local-notifications`), scheduled from the pure scheduler. No server, no VAPID keys,
   no secrets — the old infra blocker disappears for the primary platform. Web push becomes optional
   polish; the email digest stays owner-gated (needs a provider).
7. **M9 beginner redesign → M10 drills** (unchanged content).
8. **M11e — store packaging & compliance** (m11 spec §8): account deletion, privacy policy, native
   OAuth, Sign in with Apple decision, icons/splash, haptics, listings. Gated on owner accounts.

---

## 3. Milestones

### M0 — Data-loss triage: sync mount fix, backup export/import, deploy gate
**STATUS: ✅ DONE 2026-07-12** (sync mounted app-wide via SyncProvider; backup export/import shipped with merge-based restore + 7 unit tests; anonymous sign-in verified absent; Netlify gate + GitHub Actions CI added; CLAUDE.md rewritten. Live Supabase-timestamp check on /plan/revise still owed — needs the owner signed in.)
**Size:** 1–2 sessions

**Goal:** Close the two active data-loss windows (plan pages that never sync; signed-out users with no backup path) before anything else changes store shapes.

**Why now:** `useSync` lives inside UserButton (`src/hooks/use-sync.ts:14-22` via `user-button.tsx`), so activity on `/plan/revise` and any page without the button silently never syncs — an open loss window today (tech-debt #2; feature audit §6.1 amendment: "shouldn't wait for the refactor"). Signed-out users are one iOS-Safari eviction from losing months (tech-debt #4). Every later milestone mutates store shapes; without export/import first, a bad migration is unrecoverable. Main auto-deploys to Netlify, so the deploy gate must exist before risky work begins.

**Scope IN:**
- Move `useSync` from UserButton into `providers.tsx`, gated on session, so every route syncs (`src/hooks/use-sync.ts`, `src/app/providers.tsx`; verify on `/plan/revise/[surahId]`)
- Export button in settings — serialize all 7 store keys + onboarding/explainer localStorage flags to `takrar-backup.json` (~1 day per feature audit §4a-2)
- Import — parse `takrar-backup.json` and route it through the existing per-store merge functions; never blind-overwrite local state
- Reject/disable any anonymous Supabase sign-in path; export/import is the signed-out story (§6.1 step 5)
- Deploy gate — Netlify build becomes `npm run test && tsc --noEmit && next build`; GitHub Actions runs vitest + tsc per push (§6.4)
- Rewrite stale `.claude/CLAUDE.md` (claims "no backend auth, all localStorage" — tech-debt #14; it misleads every future AI session executing this plan)

**Scope OUT:** merge extraction, schemaVersion, rev/CAS (M2); sync pitch UI (M8); zero store shape changes in this milestone.

**Acceptance criteria:**
- A revision completed on `/plan/revise` with the app left on that page reaches Supabase within the 30s sync interval (verify via Supabase row timestamps)
- Export downloads one JSON with all 7 stores + flags; importing into a cleared browser profile restores plan, progress, reviews, streak, settings, onboarding state
- Importing an OLDER backup over newer local state loses no newer data (merge semantics, spot-checked)
- A deliberately failing unit test blocks the Netlify deploy (one throwaway red-test CI run)

**Verification:** preview walkthrough (launch config `takrar`) with Supabase timestamps + network tab; commit only, never push main unprompted.

---

### M1 — Quick-wins batch: all 15 audited S-effort fixes
**STATUS: ✅ DONE 2026-07-12** (all 15 shipped; SM-2 day-truncation + shared local-date helper covered by new dates.test.ts; three stale spaced-repetition tests updated to the new start-of-day contract; preview-verified: parts gate label, reciter hints, start-card time note.) OWNER AMENDMENTS: item 5 partially reverted — tajweed stays the default script (auto-expanding legend covers the explainer need); reciter hints kept on probation.
**Size:** 1–2 sessions

**Goal:** Ship every quick win from UX audit §5 as one batch — cheap, independent, each removes a persona pain point.

**Why now:** Owner directive: quick wins ship early. Independent of foundation work, they bank user-visible progress before the M2–M3 grind, and three are load-bearing: the setup-gate fix (item 1) unblocks hafiz plan creation ahead of M4, and SM-2 day-truncation (item 2) + the shared date helper (item 3) are the first bricks of the M3 time model. Sequenced after M0 only because M0 closes an active loss window in less time than this batch takes.

**Scope IN (the full checklist):**
1. Setup gate fix: `setup/page.tsx:201` → `totalLessons > 0`; same double-count at `:628` (audit M1)
2. Truncate SM-2 `nextReview` to local start-of-day: `spaced-repetition.ts:29,61,108` (audit M3)
3. One local-date helper: stats-store uses `plan.ts` `todayIso`, not `toISOString()` (audit M4)
4. Default `translationEnabled: true` (`settings-store.ts:24`) (audit M9)
5. Default `arabicScript: 'uthmani'` for new users + one-time tajweed-legend explainer (`settings-store.ts:21`) (audit M10)
6. Word-order puzzle rejects only the wrong tap, keeps correct prefix (`chunk-phase.tsx:361-377`) (audit M20)
7. Onboarding final button deep-links `/lesson/1` (`onboarding-overlay.tsx:63`) (m1 partial)
8. Plan review row deep-links into a session (`/review?start=1`); completion CTA returns to remaining plan tasks (`todays-plan.tsx:129`; `review/page.tsx:137`) (m3)
9. Add `knownLessonIds` to setup's provisional plan `useMemo` (`setup/page.tsx:83-96`) (m4)
10. Clamp `daysRemaining` at 0 everywhere (`plan/page.tsx:194`) (audit M13 partial)
11. "X due · Y overdue" copy on home tile and plan row (`page.tsx:266-270`; `todays-plan.tsx:127-143`) (m7)
12. Part-aware counters ("Part 3 of 14"); Understand gate driven by parts explored (`understand-phase.tsx:76-97,234-236`) (m10)
13. Reciter hints in picker: `{r.name} — {r.hint}` (`settings-panel.tsx:174-176`) (p2)
14. Time-honesty note on lesson start card: "~30–40 min — stop anytime, progress saves" (audit M7 partial)
15. `recordActivity` on Essentials recite completion (m15)

**Scope OUT:** anything M-effort or larger; no schema/store shape changes.

**Acceptance criteria:**
- All 15 items individually verified in preview; marking most of a juz known in setup leaves Next enabled with honest counts
- A review completed at 8pm no longer flips the plan back to "not done" the next evening (day-truncation unit test)
- New-user defaults: translation on, uthmani script; existing users' settings untouched (fresh-profile check)

**Verification:** unit tests for spaced-repetition truncation + shared date helper; preview walkthrough setup → lesson → review → plan card; tsc + existing vitest green.

---

### M2 — Sync engine hardening: pure merge lib, property tests, versioning, CAS, Playwright smoke
**STATUS: ✅ DONE 2026-07-12** — merge engine extracted to pure src/lib/sync/merge.ts (+local.ts IO, rehydrate.ts) with fast-check property tests + golden fixtures (24 new tests); all 7 stores schema-versioned with passthrough migrates; payload envelope {__v,state} with never-clobber-newer (planStoreMerge, test-pinned); CAS push on a rev column (supabase/migrations/002_user_data_rev.sql — legacy-upsert fallback until applied) with conflict re-merge retries; typed Supabase client (zero as-any); dirty-hash upload skip + lastSyncedAt; ALL window.location.reload() removed from sync/providers (store rehydration); SM-2 core deduped; onboarding/explainer flags now sync (quran-flags row). Session 3: Playwright smoke landed (e2e/smoke.spec.ts — lesson-phase walk with stubbed audio + reload persistence; seeded due-review deep-link) wired into ci.yml (chromium install + test:e2e with placeholder Supabase env). OWNER ACTIONS: apply migration 002 in Supabase before/with the next deploy; the M0 /plan/revise signed-in sync check; live two-tab concurrent-edit spot-check (needs a signed-in account + migration 002 — the CAS/merge logic itself is unit/property-test-pinned).
**Size:** 3 sessions

**Goal:** Make the 633-line untested sync merge provably safe — extracted, property-tested, schema-versioned, race-free — before any milestone changes store shapes, and land the app-wide regression net.

**Why now:** Highest silent-data-corruption surface in the app (tech-debt #1); 4 of 7 stores are unversioned (tech-debt #3). M3–M7 all change store shapes and scheduling data — landing those on an untested merge with no schemaVersion means one bug silently corrupts local AND cross-device data. The Playwright smoke lands here (not with the M9 chunk-phase refactor) so every subsequent milestone runs atop the net. This is the plan's load-bearing milestone. Decision log: JSONB snapshot + domain merge KEPT — no CRDTs, no normalized tables (§6.1).

**Scope IN:**
- Extract all merge functions from `use-sync.ts` to pure `src/lib/sync/merge.ts`; table-driven + fast-check property tests (idempotence, commutativity, no-data-loss invariants) (§6.1 step 1)
- `schemaVersion` in all 7 stores (plan/review/practice/essentials-store.ts are unversioned) + embed schemaVersion in synced payloads with never-clobber-newer rule (§6.1 step 2)
- `rev` column + compare-and-set push; replace the `as any` DB cast with `supabase gen types` (`use-sync.ts:8-10`; §6.1 step 3; tech-debt #8)
- Dirty-flag + `lastSyncedAt` in localStorage; remove hard `window.location.reload()` at `use-sync.ts:574` and `providers.tsx:42` — store rehydration instead (§6.1 step 4; tech-debt #9)
- Dedupe SM-2/sync duplication: `processReview`/`processLessonReview` shared core, single `getDueCards`, single `STORE_NAMES`, single merge tiebreak (`spaced-repetition.ts:35,82`; `use-sync.ts:14`) (tech-debt #10)
- Sync onboarding/explainer flags so a second device doesn't re-onboard (audit M22 second half; `onboarding-overlay.tsx:37-65`)
- Golden persisted-state fixtures per store; pin progress-store v<2 lesson-discard as a documented decision (§6.4 target 2)
- Exactly one Playwright smoke: cold load → mini lesson with stubbed audio → reload → progress persisted → review due (§6.4 target 5); wired into the M0 CI gate

**Scope OUT:** CRDT libraries, normalized tables (decision log); FSRS; any new user-facing feature.

**Acceptance criteria:**
- Property tests green: every store merge idempotent, commutative, union-preserving on `completedLessonIds` / review ratings / `lastRevisedAt`
- Two-device fixture: interleaved pushes with CAS never lose data; a stale-rev push retries with re-merge instead of clobbering
- A payload with newer schemaVersion is never overwritten by an older client (test-pinned)
- Zero `as any` on the sync path; zero `window.location.reload()` in sync bootstrap or providers migration (grep check)

**Verification:** vitest suite becomes the permanent regression net; Playwright smoke green in CI; two-browser-tab concurrent-edit preview simulation.

---

### M3 — Unified time model: one local day, reconciled on load, streak justice
**STATUS: ✅ DONE 2026-07-12** — ALL calendar helpers consolidated into src/lib/dates.ts (plan.ts re-exports); new pure DOM-free src/lib/streak.ts (rest-day-aware streaks: only plan study-days can break; freezes earned 1/week of streak, banked max 2, auto-consumed per missed study day via frozenDates; strictly forgiving — an uncoverable gap breaks the streak but keeps the bank); stats-store reconcile() + useDayRollover hook (load/visibility/60s tick) settle streak state before paint; migrations ride M2 machinery: reviews v1→v2 truncates stored nextReview to local start-of-day, stats v2→v3 adds freeze fields + clamps future-dated day strings (longestStreak untouched); mergeStats syncs freezes with the streak side + unions frozenDates (property-tested); ci.yml runs the date/streak/migration suites under a 4-TZ matrix incl. DST zones (TZ env is broken on Windows Node, so the matrix is CI-only; local tests are TZ-agnostic invariants). 181 tests green; acceptance verified live in preview (3-idle-day streak settles to 0 before paint w/ longestStreak preserved; freeze saves a 1-missed-day streak). DEVIATION: no blocking backup-export prompt before migrating — both migrations are non-destructive (truncate/clamp/add-fields only), so a modal gate was judged pure friction; flag at owner checkpoint if disagreement.
**Size:** 2–3 sessions

**Goal:** Establish a single local-day source of truth with an on-load/day-rollover reconciliation pass so streaks, plan, and reviews can never contradict each other — and stop punishing rest days.

**Why now:** Systemic root causes #1–2: three disconnected scheduling systems and no time model beyond "now at user-action". Every subsequent feature (blocker fix, tiers, habit loop, lapse recovery, reminders) reads "today" — building them on UTC-vs-local disagreement bakes contradictions in permanently. Must follow M2 (shape changes now migratable and tested) and precede M4–M8.

**Scope IN:**
- Single date module `src/lib/dates.ts` (local-day boundaries, `todayIso`) consumed by `stats-store.ts:21-29`, `plan.ts:18-24,282-283`, spaced-repetition consumers — completes quick-wins 2–3 into full unification (audit M4)
- On-load + day-rollover reconciliation pass: detect gap days, mature due reviews, recompute `lessonsBehind`, settle streak state BEFORE first paint — replaces mutate-only-in-event-handlers (root cause #2; `stats-store.ts:44-73`; groundwork for audit M12)
- Rest-day-aware streak: plan study-days protect the streak; "Enjoy your rest day" can no longer kill it (audit M2; `stats-store.ts:60-64`; `plan.ts:47-50`; `setup/page.tsx:51`)
- Earned streak freezes — one per active week, capped at 2 banked, auto-consumed on a single missed day; strictly forgiving: can only save streaks, never break them (feature audit §4a-5)
- One-time migration truncating existing SM-2 timestamps and normalizing stored UTC dates to local days, riding M2's schemaVersion machinery; `longestStreak` preserved; in-app prompt to export a backup before migrating
- Date-math test suite: `vi.setSystemTime` + TZ project matrix including both DST transitions and near-midnight local-vs-UTC divergence (§6.4 target 3; tech-debt #7)

**Scope OUT:** done-today unification UI + day-complete celebration (M6); lapse-recovery UX (M7); notification scheduling (M8).

**Acceptance criteria:**
- A Mon–Fri plan user's streak survives the weekend (unit test)
- Activity at 11:55pm and 12:05am local lands on the correct respective days in BOTH stats and plan (TZ/DST test matrix)
- A review completed 8pm shows "done" until local midnight — never un-completes mid-evening (regression test on audit M3)
- Opening the app after 3 idle days shows already-reconciled state before any tap — no stale streak flash then silent reset (preview with mocked clock)

**Verification:** vitest date suite across 3+ timezones incl. DST boundaries; preview with mocked clock stepping across midnight.

---

### M4 — Known-surah blocker (B1): known = tracked, revision-first entry paths
**STATUS: ✅ DONE 2026-07-12** — known surahs now revision-eligible when plan.knownTracking (getRevisionTasks candidates = completed ∪ known; whole-surah scope, lastRevisedAt→createdAt fallback; auto-frequency tier counts known); SM-2 seeding via review-store.seedKnownAyahs → createSeededCard (ease 2.3, reps 1, lastQuality 3 = shaky in health dashboard, lastReview 0 so real reviews win merges, due dates staggered over 7 local midnights) wired into plan setup, browse affordance, and legacy banner — existing cards never overwritten; 'maintain' goal type (3-step setup: pick surahs → rhythm → start; no pace/deadline; knownSurahIds = scope; staggeredLastRevised spreads initial revisions, offset==frequency due immediately); /plan/revise/[surahId] is now a RECALL TEST (PracticeSession full-passage: hidden ayahs → recite → reveal → per-ayah rating feeding the same SM-2 ayah cards; "just mark revised" escape kept) — revision and review are one system; browse-level "I already know this surah" chip on the surah page (in-plan, nothing-learned-yet only; undo keeps ratings); /review empty state routes hafiz to revision not the beginner funnel; surah-page tab renamed Practice→Review (m18); legacy plans gated by an opt-in banner on Today's Plan (knownTracking undefined → "Track them"/"Keep them out", backup pointer included); today's-plan card fixed to render without a lesson track (maintain). 181→191 tests green (acceptance: juz-known → 0 lessons + revision schedule; toggle-off restores lessons; seeded = shaky never strong; stagger spread pinned). Persona-C walkthrough verified in preview: maintain plan in 5 taps → 15 seeded shaky cards + staggered lastRevisedAt → recall test rated got-it/shaky/missed → SM-2 q5/q3/q1 + health bar shows strong/shaky/weak split → lastRevisedAt updated + streak recorded; legacy banner + browse chip + hafiz empty state screenshot-verified.
**Size:** 2–3 sessions

**Goal:** Redefine "known" from hide-everywhere to skip-lessons-but-seed-retention, giving the revision hafiz (persona C) a first-class home.

**Why now:** The audit's ONLY BLOCKER: persona C is architecturally unsupported — pre-assessment silently discards their hifdh (`plan.ts:133`) and no revision-first entry point exists. Sequenced here because seeding cards for whole juz creates new synced data shapes (needs M2's tested, versioned merge — deliberately NOT before it) and revision scheduling reads M3's coherent day. Precedes M5 because tiers are meaningless until known material is represented at all. Owner directive: revision-heavy users are representative, not niche.

**Scope IN:**
- Change `plan.ts:133` semantics — known surahs excluded from new lessons but INCLUDED in revision eligibility; lessons marked complete-by-attestation so plan progression (`plan.ts:160-194`) stays consistent
- Seed SM-2 cards on marking known — wire the unused `addCardsForSurah` (review-store; tech-debt #15) at conservative "shaky" strength with staggered initial due dates; optional one self-rating calibration pass per surah upgrades honestly (resolves audit open question 1; cards currently mint only at `complete-phase.tsx:43` and `practice-session.tsx:246`)
- Revision-only plan: "maintain my hifdh" goal type with 0 new lessons in setup (audit open question 2; `plan-store.ts:59-83`)
- Browse-level "I already know this" affordance beyond setup/edit (m9; `plan-store.ts:116-123`; `page.tsx:386-417`)
- Route hafiz users correctly: `/review` empty state and home CTA offer "Revise what I know" instead of the beginner-lesson funnel (`review/page.tsx:144-155`)
- Real revision flow — `/plan/revise/[surahId]` gets recall test + rating feeding SM-2 and surah health, replacing display-plus-"Mark as revised" (m8; feature audit §4a-6; `plan/revise/[surahId]/page.tsx:67-81`) — unifies the revision and review systems (root cause #1)
- Preserve + relocate the practice self-rate mechanism (`practice-session.tsx:212-264`) as the attestation engine; finish Learn/Review terminology rename incl. surah-page tab (audit M21, m18; §6.5)
- Extend pre-assessment to surah-goal plans (m17; `setup/page.tsx:177` — hand-picked surahs are MORE likely already known)
- Gate the semantics change behind an explicit confirm for existing plans; prompt backup export before migration

**Scope OUT:** sabaq/sabqi/manzil framing, rotation, caps (M5); mutashabihat (M10).

**Acceptance criteria:**
- Fresh user marks all of Juz 30 known → zero new lessons, a populated revision schedule, cards visible as "shaky" (not strong, not absent) in the review health dashboard
- A revision-session rating updates SM-2 `nextReview` and surah health (revision and review are one system — preview check on the health bar)
- A revision-only plan renders Today's Plan with revision tasks and no beginner-lesson funnel anywhere; creatable in ≤5 taps
- Toggling "known" off restores lesson availability without losing seeded ratings (unit test)
- `knownSurahIds` and seeded cards round-trip through sync intact (M2 property tests extended to new shapes)

**Verification:** scripted persona-C preview walkthrough (mark known → revise → rate → health updates) + unit tests on plan generation with `knownSurahIds`.

---

### M5 — Retention engine v2: sabaq/sabqi/manzil tiers, flood caps, leech escalation
**Size:** 2–3 sessions

**Goal:** Re-bucket the flat SM-2 queue into the three-stream method-faithful cycle with per-day caps, batched overdue sessions, a manzil rotation layer, and leech detection.

**Why now:** Immediately after M4 by necessity: seeding whole juz of cards makes the already-uncapped queues (audit M14's 34-card dumps, M15's same-day revision floods) explode — caps must land before persona-C users hit them. The manzil gap is the feature audit's "big one" method failure (old-but-not-due surahs silently rot). Depends on M3's well-defined "today". Caps/batching live HERE, not in lapse recovery, because flood risk starts the day M4 ships.

**Scope IN:**
- Three-stream Today's Plan — Sabaq (new), Sabqi (guaranteed daily/near-daily touch of last ~7–20 days), Manzil (long-term) — a rename/re-bucket of computations that already exist, with one-line in-context explanations (`plan.ts:178-268`; `todays-plan.tsx:145-170`; feature audit §4b-1, §5); nudge revise-before-new ordering (§5 session-ordering gap)
- Manzil rotation layer ON TOP of unchanged SM-2: everything memorized cycles every N weeks regardless of predicted recall, least-recently-touched first (§5 "not captured"; §4b-6)
- Review session caps + batching: ~10-card default batches with "X of Y overdue" framing and explicit continue-or-stop between batches — no more "Card 1 of 34" (audit M14; `review/page.tsx:81-92`; presentation fix, ratings already persist per-card)
- Per-day revision cap + spreading so completed surahs never all land the same day (audit M15; `plan.ts:240-268`)
- Leech detection: ayah failed K consecutive reviews flagged for focused isolated drilling, Anki-model, algorithm-agnostic — adopted before any FSRS talk (§5 lapse-escalation gap; feeds M10's weak-ayat drill)
- Scheduler in pure DOM-free `src/lib` (RN-insurance note, §6.3), exhaustively unit-tested; schema changes ride M2's versioning; merge tests extended for new fields

**Scope OUT:** FSRS — explicit deferral (see Decision log 3). Lapse-recovery UX for returners (M7); mutashabihat (M10).

**Acceptance criteria:**
- A user with 40 overdue cards sees a capped first batch with overdue framing and an explicit continue prompt (seeded 40-card backlog fixture in preview)
- Completed-surah revisions never exceed the per-day cap; excess spreads to subsequent days (unit test)
- Every memorized surah has a next-manzil date ≤ N weeks out even when SM-2 says not-due (unit test)
- An ayah failed 3+ consecutive reviews appears in a flagged leech list
- Persona-C fixture (whole Juz 30 known via M4) receives a bounded, tiered daily plan — no flood, no starvation; migration verified against golden fixtures, no card loses interval history

**Verification:** unit tests on the pure scheduling lib (bucketing, caps, rotation, leech threshold) + preview with mixed-corpus fixture user.

---

### M6 — Habit loop closure: one "done today", a day-complete moment, honest progress, badging
**Size:** 1–2 sessions

**Goal:** Give every day a visible close — one done-today definition, one celebration — and make the headline progress metrics and app icon tell the truth.

**Why now:** Root cause #4: the retention loop has no closing edge — closure is a silent text flip and the marquee stat says "you've done nothing" for months. Buildable only now: needs M3's day model (else "done today" stays contradictory) and M5's caps (else the celebration sits atop a flood). Must precede M8 — reminders are pointless without a day-complete state to remind toward. Badging is pulled forward from the reminders milestone: zero permission, zero server, immediate re-engagement value.

**Scope IN:**
- Unify done-today: for plan users the ring/streak is driven by plan completion via ONE shared selector; activity-count fallback kept for planless users (audit M5; `settings-store.ts:26`; `stats-store.ts:56-73`; `page.tsx:83-84,255`; `todays-plan.tsx:63-75`)
- Day-complete moment: finishing the last plan task triggers an explicit celebration tying streak + goal + tomorrow's preview; Complete screen becomes plan/streak/goal-aware ("That's your plan done — day 12 streak"); replaces the `todays-plan.tsx:85` text flip (audit M6; `complete-phase.tsx:57-108`; `plan-celebration.tsx:33` as reference)
- Badging API: due-count on the installed app icon, cleared on open — notifications Tier 0, the free win (§6.2 amended; `public/sw.js` + `providers.tsx`); confirm `/manifest.webmanifest` serves in prod + add 512 maskable icon while here
- Progress hero off /6236 → plan-scoped or word-weighted progress; whole-Quran % demoted to secondary stat (audit M19; `progress/page.tsx:48-62,152-163`); fix home "Lessons X/Y" tile denominator (m6; `page.tsx:159-171,272-275`)
- Plan-surface discoverability: promote Plan dashboard out of the 11px "Manage" link (m16; `todays-plan.tsx:90-95`; resolves audit open question 10 minimally, no bottom-nav rework)
- Behind-schedule nudge for deadline-free plans — the default plan type stops being nudge-free forever (m5; `plan.ts:340-346`)

**Scope OUT:** push/email (M8); welcome-back/lapse UX (M7); resume affordances (M9); sync pitch wiring (M8).

**Acceptance criteria:**
- Finishing the last plan task triggers the day-complete state exactly once (replay-guarded — redoing a lesson doesn't re-fire), reflected simultaneously in home ring, streak, and plan card
- Grep confirms one selector is the sole source of "done today" on plan-user paths — no remaining direct `dailyGoalActivities` reads
- Progress hero shows a meaningful nonzero percentage for a day-1 Juz-30 plan user
- Installed PWA (Android/desktop) icon badge equals due-review count and clears on open (real installed-PWA check)

**Verification:** preview run of a full plan day (lesson + review + revision) end-to-end; badge on real device; unit test on the shared selector.

---

### M7 — Lapse recovery + returner experience
**Size:** 2 sessions

**Goal:** Detect a lapse on load and offer triaged, capped, emotionally-sane re-entry: welcome-back mode, multi-day catch-up covering review debt, and deadline renegotiation.

**Why now:** Persona D is "silently flooded" today (UX audit §2D) and lapse recovery is a differentiator nobody does well (feature audit §4b-3). Depends on M3's reconciliation pass (detection), M5's tiers + caps (what to triage into), and M6's day model (what "back on track" means). Must precede M8: a push notification that summons a returner must land them in triaged re-entry, not a flood.

**Scope IN:**
- Welcome-back mode on >14-day gap detection (from M3's reconciliation pass): acknowledgment screen, Best streak shown instead of silent reset-to-1, restore-not-zero emotional framing (audit M12 UX half, m14; `stats-store.ts:44-73`; `page.tsx:186-191`; `onboarding-overlay.tsx:72-76`)
- Triaged re-entry (§4b-3): shrink the overdue queue into a reduced first day; run weakest lessons (existing weak-ayah flags) through short consolidation before normal tier scheduling resumes
- Catch-up rework: replace the flat 0–10 same-day clamp with debt spread across coming days, INCLUDING the review/revision backlog that actually dominates a returner's debt (audit M16; `plan-store.ts:158-163`; `plan.ts:169-172,343-344`)
- Lapsed-deadline branch: "target date passed — pick a new date / drop deadline" with auto-suggested recomputed date, completing quick-win 10's clamp (audit M13; `plan.ts:340-346`; `plan/page.tsx:193-195`; `todays-plan.tsx:107-110`); declining converts cleanly to deadline-free with M6's nudge intact
- All recovery scheduling in the pure `src/lib` scheduler from M5, unit-tested

**Scope OUT:** push/email re-engagement (M8 — reaches persona D before they return; this milestone owns what happens once they're back); first-session shape (M9).

**Acceptance criteria:**
- Mocked-clock E2E: 30 days away → welcome-back mode on open, first session ≤10 cards, zero "-Nd remaining" anywhere, streak state explained not silently reset
- Unit test: 25-lesson + 40-review debt produces a multi-day catch-up schedule respecting daily caps, weakest-first
- Returning after only 2 days does NOT trigger welcome-back (threshold unit test)
- Declining a new deadline cleanly converts the plan to deadline-free with the pace nudge intact (preview)

**Verification:** preview with mocked clock jumps (0d/2d/15d/30d gaps); lapse/catch-up unit tests extended on the M3 date suite.

---

### M8 — Reminders: web push, email digest, sync pitch
**Size:** 2–3 sessions

**Goal:** Give the SM-2/tier engine a voice — installed-PWA push at the user's hour, a weekly email digest for the fully lapsed — and pitch cloud sync at moments of earned value.

**Why now:** The #1 product gap (zero notification code; "an SRS you're never reminded of silently dies" — §4a-1, audit M23). Deliberately after M3/M6/M7: reminders fired against a contradictory "due" model, with no day-complete state to point at, landing returners in floods, would burn the one-shot notification permission forever. Introduces Takrar's first server secret, so it also waits for M2's hardened sync. Notification content reads M5's tiers ("Sabqi due: An-Naba · 2 manzil surahs"), not a flat count.

**Scope IN:**
- `push_subscriptions` table with own-rows RLS, IANA tz + `reminder_hour`; user-gesture-gated subscribe toggle with chosen hour in settings (§6.2; `settings-panel.tsx`)
- SW push/notificationclick handlers deep-linking to `/review` or Today's Plan (`public/sw.js` is install/activate/fetch only today)
- Hourly Netlify scheduled function using web-push with the service-role key — first server secret, scoped to this function only; sends only when reviews are actually due; prune dead endpoints on 410; subscription health self-check on app open
- iOS flow gated on `display-mode: standalone` (iOS 16.4+ installed PWA); non-installed iOS Safari never sees a broken prompt
- Weekly email digest (Tier 2) — due counts, streak status, comeback deep link, mandatory unsubscribe; the only channel that reaches persona D after the PWA dies
- Sync pitch (audit M22): contextual account prompt at earned-value moments — first-surah completion, M6's day-complete moment, backup export — once-dismissed-forever; replaces the never-pitched UserButton-only entry (`user-button.tsx:63-68`)
- Ship order within milestone: Android/desktop push → iOS standalone flow → email digest (badging already shipped in M6 per §6.2 order)

**Scope OUT:** notification content personalization/ML timing; native local notifications (Capacitor-trigger territory); marketing email; push as anything load-bearing — nudge only, all flows fully functional with permission denied.

**Acceptance criteria:**
- Installed PWA on Android and desktop receives a tier-aware reminder at the chosen local hour; tap opens the app to the session; iOS 16.4+ standalone verified on-device
- No notification fires when nothing is due; permission-denied users see zero errors and no re-prompt loop
- Dead endpoints pruned after a forced 410; re-subscribe self-heals on app open (function test)
- Test account with 8+ days inactivity receives the digest with correct due count and working unsubscribe; deep link lands in-app
- Signed-out sync pitch appears exactly once at each defined moment, never for signed-in users

**Verification:** real-device matrix (Android Chrome, desktop Chrome/Edge, iOS Safari standalone); Netlify scheduled-function logs over 48h; non-UTC timezone spot-check account.

---

### M9 — Beginner first-session redesign + long-ayah pedagogy
**Size:** 3 sessions

**Goal:** Get persona A from install to a first felt success in ~20 minutes with no walls — reduced first-lesson pattern, readable tests, settings-respecting word renders, working resume, fast loads.

**Why now:** Big rock (d), sequenced late NOT because it matters least: A's quit risk is reversible UX pain, not data loss, and M1's quick wins already blunted the sharpest edges (translation, script, time-honesty, word-order). Its core work requires refactoring the 1152-line chunk-phase (tech-debt #6), which is only safe atop M2's CI + Playwright smoke. Method rationale: 6-4-4-6 is right for standard sabaq but wrong applied uniformly — a first-timer needs a smaller imprint dose, and a 14-part ayah needs chaining BETWEEN parts, the app's own principle violated at exactly the hardest content.

**Scope IN:**
- Enabler first — extract the chunk-phase step state machine into a pure tested hook/lib with golden fixtures pinning exact rep sequences (normal, first-lesson, split-ayah) BEFORE any behavior change (tech-debt #6; `chunk-phase.tsx`, 1152 lines)
- Lighter first-lesson pattern: reduced reps/listens for the user's first-ever lesson + upfront time estimate + resume mention; 6-4-4-6 stays default everywhere else (audit M7; `chunk-phase.tsx:56-61,221-237`; `listen-phase.tsx:23`; `test-phase.tsx:37-50`); promote Build's "Skip to Test" escape (p1; `chunk-phase.tsx:1104-1112`)
- Test Level 2 transliteration hints for non-readers (audit M8; `test-phase.tsx:312-330,356-388`)
- Shared `WordText` component so fill-blank, word-order chips, and Essentials respect script + transliteration/translation settings (audit M11, m12; root cause #5; `test-phase.tsx:253-297`; `chunk-phase.tsx:1044-1083`; `essential-card.tsx:123-126`; `recite-mode.tsx:201-204`)
- Long split-ayah pedagogy: part-chaining in Build (A, B, A+B, C…), tests at waqf-part granularity instead of one-word fill-blank passing 1/1, part-level dots for re-drilling (audit M17, m11, p4; `chunk-phase.tsx:88-91,267-314,787-845`; `test-phase.tsx:194-247`)
- Resume fixes: auto-scroll/jump-to-current in the 165-card lesson list; deterministic Continue-card fallback (most-recent, not first-inserted) so resume survives a fresh/synced device (audit M18; `lesson/[surahId]/page.tsx:148-210`; `page.tsx:151-156,233-246`)
- Onboarding reassurances (time, crutches, skippability, auto-save) + zero-lesson home CTA becomes "Start Al-Fatihah" with Planner demoted for them (m1, m2; `onboarding-overlay.tsx:37-65`; `page.tsx:203-218`)
- Surah JSON range-slicing — `getSurahRange(id, from, to)` or build-time per-lesson chunks, scheduled with this lesson-flow touch per §6.5 (tech-debt #5; `quran-data.ts:38`)

**Scope OUT:** multiple named rep-pattern presets (10/10, Madinah 20x — backlog); word-by-word audio highlighting; voice-compare changes; Arabic tracing.

**Acceptance criteria:**
- Rep-count math unit test on the extracted step machine: first Al-Fatihah lesson computes to ~≤25 min at default pace; one timed mobile-viewport preview run confirms, with skip affordances visible in every phase
- A 14-part ayah's step sequence includes part-chaining stages and part-granularity tests — no 128-word cold recall gate (unit test on the extracted machine)
- Translit/translation/script toggles hold in Test L2, fill-blank, word-order, and Essentials — on AND off (settings-matrix preview; the toggle never reads as broken)
- A 5-ayah Baqarah lesson loads without parsing the 2.4 MB surah-2.json (network panel)
- Continue card resumes the true most-recent lesson on a freshly synced second device; surah page opens scrolled to current

**Verification:** golden-fixture tests on the extracted state machine; Playwright smoke still green in CI; timed first-session walkthrough on mobile viewport.

---

### M10 — Recall drills pack: hide-words, audio repeat controls, mutashabihat v1, weak-ayat drill
**Size:** 2–3 sessions

**Goal:** Ship the missing recall modalities that are table stakes in dedicated hifz apps: per-word hide/fade testing, granular audio repetition, similar-verse awareness, and ayah-level quick drills.

**Why now:** Last because it is purely additive surface whose dependencies are only now satisfied: hide-words builds on M9's WordText, the weak-ayat drill consumes M5's leech flags, drills feed M5's tiers and health data, and the Playwright smoke exists to fold assertions into. Shipping earlier would have built drills on render paths that ignore user settings and a scheduler that floods.

**Scope IN:**
- Hide-words / fade-out recall mode: per-word mask levels (full → first letters → hidden) on word tiles in Test phase and review/revision sessions (feature audit §4a-3; the word-tile architecture is "perfectly shaped" for it; uses M9's WordText)
- Granular audio-repeat controls: per-ayah/part repeat count, pause interval, A-B loop — settings/UI exposure of the existing sliced-audio engine, not an engine build (§4a-4; `audio.ts`); consolidate Build's local speed buttons with persisted `playbackSpeed` (p5; `chunk-phase.tsx:927-940`)
- Mutashabihat v1, data-only: known-pairs dataset shipped; "this ayah has a twin in Surah X" surfaced in Understand/Test with the differing word highlighted via WordText (§4b-2)
- Ayah-level quick review: wire the existing unused ayah cards/store into a 5-minute "drill your weakest ayat" session, seeded by M5 leech flags (§4b-7; tech-debt #15 — wire it or delete it)
- Historical weak-spot log: persist per-ayah miss history into a "recurring weak ayat" view — Tarteel paywalls this; our data already flows (§4b-4); if session budget runs out, explicitly bump to backlog
- Opportunistic while in audio code: resolve Husary segment-reciter silent fallback — add timing files or remove from `SEGMENT_AUDIO_RECITERS` (tech-debt #11)
- Fold a hide-words assertion into the existing Playwright smoke, not a new spec (§6.4 addition)

**Scope OUT:** side-by-side mutashabihat distinguish drill (v2, after data-only ships); voice-compare in reviews (deferred — needs Whisper self-hosting first, §6.5/tech-debt #13); recite-full-range blind test (backlog).

**Acceptance criteria:**
- Any memorized lesson recallable in fade-out mode with per-word reveal in both Test and a review session, respecting script/translit settings via WordText
- Repeat count / pause / A-B loop settings audibly change playback and persist; grep confirms one source of truth for playback speed
- A known mutashabih ayah shows its twin reference with the differing word highlighted in Understand (fixture-driven preview)
- "Drill weakest ayat" launches from `/review`, consumes ayah cards seeded by leech flags, updates their scheduling (unit test on card consumption), completes in ~5 minutes

**Verification:** extended Playwright smoke green in CI; manual audio-loop test on mobile Safari + Android Chrome; store inspection of ayah-card state changes.

---

### M11 — Mobile-native elevation & store launch (owner priority; direction approved)
**Size:** ~8-10 sessions across five sub-milestones (M11a-e)

**Goal:** Make Takrar feel indistinguishable from a polished native app, then ship it to the
App Store / Play Store via Capacitor.

**Direction (owner-approved 2026-07-12):** "Native Stack" — flat push/pop stack navigation,
edge-swipe-back, collapsing large-title headers, everything-is-a-bottom-sheet — plus two
paper accents: dealt-in staggered lists with settling tilt, and a gliding paper-chip tab
indicator. Whole-screen rotation explicitly rejected as gimmicky. Full contract, motion
tokens, audit-fail checklist, sub-milestones (M11a device spike FIRST), tactile-budget rule
and the owner tuning checkpoint: **`.claude/plans/m11-mobile-native-spec.md`**; approved
interactive mockup: `.claude/plans/assets/m11-approved-mockup.html`.

**Sequencing:** M11a (Capacitor spike on the owner's phone) can run immediately; M11b-e
after M0 at minimum — a store launch multiplies users of any remaining data-loss window.
Owner decides how M11 interleaves with M2-M10.

---

## 4. Decision log

**Made calls:**
1. **KEEP per-store JSONB snapshot sync + hand-rolled domain merge** — no CRDT libraries, no normalized per-card tables. The data is semilattice-shaped and the merge is the correct design; harden it in M2, don't replace it (feature audit §6.1).
2. **PWA, NOT React Native** — 60% of an RN port rewrites the hardest-won polish (UI, word-timed audio, Whisper worker, SW). Capacitor is the escape hatch. Cheap insurance kept: DOM-free `src/lib` scheduler (M5), merge extraction (M2), audio behind `audio.ts`. Revisit triggers: store distribution becomes a growth requirement, push proves unreliable in practice, or unfixable iOS audio jank (§6.3).
   **OWNER OVERRIDE (2026-07-10): the store-distribution trigger is fired.** The owner considers app-store presence key to building a userbase. Path: mobile-native UI elevation of the PWA (design-first; competing directions being mocked for approval) → **Capacitor wrap for App Store / Play Store**, specced as milestone M11 once a design direction is approved. RN remains rejected only in the rewrite sense.
3. **FSRS DEFERRED** — migrating card state while sync was untested is the risky order; SM-2 pain only materializes at persona-C volumes. Anki's algorithm-agnostic leech/relearning ideas adopted first (M5). Revisit trigger: after M5 stabilizes AND persona-C users report review-load pain — evaluate together with manzil tuning as one "retention engine v3" effort (§5).
4. **Self-rating stays the source of truth for recall quality**; voice is assistive signal only ("voice suggests: shaky" pre-fill is the ceiling) — Tarteel's accuracy backlash proves over-promising AI destroys trust.
5. **Quick wins ship as one early batch (M1)** per owner directive; the practice self-rate mechanism survives all renames (M4); streaks are forgive-by-design, not infinitely (rest-day protection + capped earned freezes, no gems/hasanat).
6. **Commit-only workflow** — never push main unprompted (auto-deploys to Netlify); deploy gate `npm run test && tsc --noEmit && next build` lands in M0 so main can never deploy red.

**Not-now list (each with explicit revisit trigger — none are permanent vetoes):**
- **Real-time AI mistake detection (Tarteel clone):** their moat, their #1 complaint (false positives, accents, noise); whisper-base can't do it credibly. *Revisit trigger:* a whisper-large-v3-class model runs on-device AND the recitation-segmenter is distilled to client scale. Ceiling until then: assistive "voice suggests: shaky" pre-fill.
- **Social feed / leaderboards / groups:** heavy schema+RLS+moderation lift for a solo dev; many memorizers explicitly want privacy; privacy-first is a stated identity. *Revisit trigger:* organic, repeated user demand specifically for family/khatma sharing — not before.
- **Teacher/madrasa dashboard:** a different B2B product with per-student billing; would consume the roadmap whole. *Revisit trigger:* only as a deliberate second-product business decision.
- **Native app / React Native:** RN rewrite stays out — but per the owner override in decision 2 (2026-07-10), the *store launch itself* is promoted OFF this list: mobile-native UI elevation + Capacitor packaging is planned as M11.
- **Hasanat counters / gems / reward-tier gamification:** tonally wrong for Takrar's calm, method-serious identity; documented streak-anxiety and metric-gaming risks. *Revisit trigger:* only if retention data shows streak + heatmap + earned freezes failing AND the brand identity itself is re-decided.
- **Tafsir library / reflection platform:** content licensing + moderation weight; one-line meaning-anchoring in Understand captures the retention benefit. *Revisit trigger:* none absent explicit licensing appetite.

## 5. Risk register (top 5)

1. **M2's own hardening corrupts data** (the catastrophe it exists to prevent). *Mitigation:* export/import ships FIRST (M0) as user escape hatch; extraction is behavior-preserving before any behavior change; property tests + golden fixtures land in the same session as extraction; M0's deploy gate blocks red suites from auto-deploying main.
2. **M3 time-model migration silently breaks existing streaks/schedules** (a broken 200-day streak is a trust catastrophe). *Mitigation:* migration rides M2's schemaVersion machinery; `longestStreak` explicitly preserved; multi-TZ/DST test matrix written BEFORE the migration; in-app backup-export prompt before migrating; reconcile-on-load rounds ambiguity in the user's favor.
3. **M4 seeding floods the very hafiz users being rescued** (whole-juz card dumps). *Mitigation:* conservative "shaky" seed strength with staggered due dates; M5's caps/batching sequenced immediately adjacent; optional calibration self-rating prevents false-strong baselines; explicit confirm gate for existing plans; manzil rotation (M5) is the structural backstop against false-strong rot.
4. **Retention-engine scope creep** (M4–M7 is four interlocking scheduling milestones for a solo dev; FSRS temptation, manzil tuning, lapse UX each could eat the roadmap). *Mitigation:* FSRS decision-logged with explicit trigger; manzil is a thin rotation layer on unchanged SM-2; hard OUT lists per milestone; 1–3-session sizing forces shippable increments; M1 already banked visible progress so foundation weeks aren't silence; caps/batching are the cut-line priority if M5 runs long.
5. **Web push: first server secret plus one-shot permission burn** (a wrong notification gets permission revoked forever). *Mitigation:* service-role key scoped to the scheduled function only, own-rows RLS; push is a nudge, never load-bearing; ships only after M3/M6/M7 make "due today" truthful and the landing experience triaged; dead-endpoint pruning + health self-check; badging (M6) and email digest (M8) as independent fallback channels; if reliability stays poor, that is the recorded Capacitor trigger, not a blocker.

## 6. Traceability appendix (audit finding → milestone)

Labels: `B*/M*/m*/p*` = UX audit findings (`audit-ux-flows.md` §4–5); `§4a/§4b` = feature audit gaps; `TD#` = feature audit tech-debt hit list.

| Finding | Where handled |
|---|---|
| **BLOCKER B1** (known surah deleted from all engines) | **M4** |
| M1 setup gate double-count | M1 item 1 |
| M2 rest days kill streaks | M3 |
| M3 SM-2 exact timestamps | M1 item 2 (truncation) + M3 (full model + migration) |
| M4 UTC vs local days | M1 item 3 (helper) + M3 (full unification) |
| M5 two done-today definitions | M6 |
| M6 no day-complete payoff | M6 |
| M7 40–50 min first lesson | M1 item 14 (time-honesty, partial) + M9 (reduced pattern) |
| M8 Test L2 Arabic-only hints | M9 |
| M9 translation off by default | M1 item 4 |
| M10 tajweed script default | M1 item 5 |
| M11 per-word renders ignore script | M9 (WordText) |
| M12 stale streak, silent reset | M3 (on-load reconciliation) + M7 (welcome-back UX) |
| M13 lapsed deadline "-Nd" | M1 item 10 (clamp) + M7 (renegotiation branch) |
| M14 uncapped "Card 1 of 34" | M5 (caps + batching) |
| M15 same-day revision flood | M5 (per-day cap + spreading) |
| M16 catch-up flat clamp, ignores review debt | M7 |
| M17 long split-ayah, no part-chaining | M9 |
| M18 resume: 165-card scroll, Continue fallback | M9 |
| M19 progress hero /6236 | M6 |
| M20 word-order wipes all progress | M1 item 6 |
| M21 practice mechanism must survive | M4 (relocated + rename finished) |
| M22 sync never pitched, no backup, unsynced flags | M0 (export/import) + M2 (flag sync) + M8 (pitch) |
| M23 zero re-engagement channel | M6 (badging) + M8 (push + email digest) |
| §4a-1 reminders | M6 + M8 |
| §4a-2 export/import | M0 |
| §4a-3 hide-words | M10 |
| §4a-4 audio repeat | M10 |
| §4a-5 streak freeze | M3 |
| §4a-6 real revision flow | M4 |
| §4b-1 three-stream plan | M5 |
| §4b-2 mutashabihat | M10 (data-only v1) |
| §4b-3 lapse recovery | M7 |
| §4b-4 weak-spot log | M10 (budget-permitting, else explicit backlog) |
| §4b-5 voice-compare deepened | DEFERRED (see §7) |
| §4b-6 manzil rotation | M5 |
| §4b-7 ayah quick review | M10 |
| Minors m1–m18 | m1→M1+M9; m2→M9; m3→M1; m4→M1; m5→M6; m6→M6; m7→M1; m8→M4; m9→M4; m10→M1; m11→M9; m12→M9; m14→M7; m15→M1; m16→M6; m17→M4; m18→M4. Deferred: m13, m19 (see §7) |
| Polish p1–p5 | p1→M9; p2→M1; p4→M9; p5→M10. Deferred: p3 (see §7) |
| TD#1 untested sync merge | M2 |
| TD#2 useSync mount | M0 |
| TD#3 unversioned stores | M2 |
| TD#4 no signed-out backup | M0 |
| TD#5 surah JSON size | M9 |
| TD#6 1152-line chunk-phase | M9 |
| TD#7 date-math untested | M3 |
| TD#8 `as any` DB cast | M2 |
| TD#9 hard reloads | M2 |
| TD#10 SM-2/sync duplication | M2 |
| TD#11 Husary silent fallback | M10 (opportunistic) |
| TD#12/#13 recorder + Whisper CDN | Deferred with voice-compare (see §7) |
| TD#14 stale CLAUDE.md | M0 |
| TD#15 unused stores | M4 (`addCardsForSurah` wired) + M10 (ayah cards wired); practice-history remainder deferred (see §7) |

## 7. Deferred list

Each entry: what, why deferred, and the trigger that reopens it.

1. **FSRS scheduling algorithm** — migrating card state during the same window sync and store shapes are changing is the highest-risk possible order; SM-2 pain only materializes at persona-C volumes. *Trigger:* after M5 stabilizes AND persona-C users report review-load pain; evaluate together with manzil tuning as one "retention engine v3" effort. Anki-style leech/relearning adopted first in M5.
2. **Voice-compare expansion into review sessions (§4b-5)** — precondition unmet: Whisper is CDN-dependent and silently dead offline; must self-host the transformers runtime + model (or SW-cache) first, and migrate the deprecated ScriptProcessorNode recorder to AudioWorklet (TD#12/#13). *Trigger:* Whisper self-hosting done + M10 drills shipped and adopted.
3. **Side-by-side mutashabihat distinguish drill** — M10 ships the data-only version (pairs dataset + twin callout + differing-word highlight) which captures most of the value. *Trigger:* after M10 ships, if twin-callout engagement shows demand.
4. **Recite-a-full-range blind test + "use this surah in your next prayer" prompts** — valuable method extensions but displaceable by any big-rock overrun; no dependency blocks them later. *Trigger:* post-M10 polish/method pass.
5. **Alternative rep-pattern presets (10/10, Madinah 20x)** — M9's extracted step state machine makes them cheap later; shipping now multiplies test surface during the riskiest refactor. *Trigger:* post-M9, on user request.
6. **m13 (word-tap audio plays fixed reference reciter)** — L effort for a cosmetic voice-switch annoyance; no dependency. *Trigger:* post-M10 polish pass.
7. **m19 ("Current Juz" = most-completed not most-recent)** — S-effort cosmetic heuristic, no retention lever. *Trigger:* post-M10 polish pass.
8. **p3 (word-weighted effort stats — a 128-word ayah counts as "1 ayah")** — M-effort stats change; partially mitigated by M6's word-weighted progress-hero option. *Trigger:* post-M10 polish pass alongside m13/m19.
9. **Historical weak-spot log view (§4b-4)** — conditionally in M10; if session budget runs out it is explicitly bumped here. The underlying per-ayah miss data already flows (M5 leech detection persists it); the view is pure presentation. *Trigger:* first M10 follow-up session.
10. **Practice-history UI (sessions saved, never read — TD#15 remainder)** — feature audit §6.5 says fold into progress page or delete; decision paired with M4's practice relocation but the history view itself is displaceable. *Trigger:* post-M10 polish pass — wire it or delete the dead writes.
11. **AI mistake detection, social features, teacher dashboard, native app, gamification, tafsir** — see the not-now list in the Decision log (§4) for reasons and revisit triggers.