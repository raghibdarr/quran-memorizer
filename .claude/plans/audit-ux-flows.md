# Takrar UX Audit — Persona Flow Walkthroughs

*Synthesized from 7 code-walked journey audits (personas A–D) + senior verification pass. Every claim is anchored to file:line in the current codebase. One placeholder journey was discarded. Corrections from the verify pass are already applied (rep counts, catch-up mechanics, severity re-grades, dedup).*

---

## 1. Executive summary

Takrar's lesson pedagogy, settings system, and plan setup are genuinely strong — the failures are almost all at the seams. Persona C (revision hafiz) is **architecturally unsupported**: marking a surah "known" deletes it from every engine instead of scheduling it (the audit's only blocker). Personas B and D suffer from one shared root cause: three disconnected time/doneness systems (SM-2 timestamps, plan revision intervals, UTC-day streaks) that contradict each other — rest days kill streaks, reviews mature after the user's session, "all done today" un-completes itself. Persona A's quit risk is concentrated in minutes 0–45: a 40+ minute first lesson, translation off by default, unexplained multicolor tajweed script, and a test level unreadable to non-Arabic-readers. Persona D returns to a silent flood — stale streak, negative "-5d remaining", 34-card uncapped review session. The retention loop has no closing edge anywhere: no day-complete moment, no push reminders, and the fully-built cloud sync is never pitched to users. Five coordinated fixes (§ Top priorities) resolve ~80% of findings.

**Top priorities:** (1) Known-surah → revision track, (2) unify the day/time model, (3) close the daily habit loop, (4) de-risk the beginner's first session, (5) return-and-retention layer (batched reviews, deadline recovery, sync pitch, web push).

---

## 2. State of each persona

**A — Complete beginner: carried well, then walled.** Transliteration is on by default and consistent through Listen/Understand/Build (settings-store.ts; understand-phase.tsx:163,337; chunk-phase.tsx:879,1078), word-tap always gives audio+meaning (understand-phase.tsx:340-342), and every phase is skippable. But the first full lesson (Al-Fatihah, 7 ayahs) is a 40–50 minute marathon (~70 self-report taps in Build even with auto-play covering listen reps — chunk-phase.tsx:56-61,221-237), the app opens on unexplained multicolor tajweed script (settings-store.ts:21), translation is hidden behind per-ayah taps (translationEnabled:false), and Test Level 2 shows Arabic-only letter hints with zero transliteration (test-phase.tsx:356-388) — a hard wall for someone who can't read script. Nothing in onboarding warns about length, mentions the crutches, or deep-links to a first lesson; the most prominent Home CTA is the Hifdh Planner, not "start Al-Fatihah" (page.tsx:206-218).

**B — Habit builder: excellent on-ramp, no payoff loop.** Plan setup is a 4-tap masterpiece of defaults (Juz 30 pre-selected, deadline off, 1/day — setup/page.tsx:36-51) and the plan card deep-links new lessons in 1 tap (todays-plan.tsx:176-178). But the day never *closes*: finishing the plan just flips a text label (todays-plan.tsx:85), the Complete screen knows nothing about plan/streak/goal (complete-phase.tsx:57-108), and two contradictory "done today" systems coexist (activity-count ring/streak vs plan tasks). Reviews take 2 taps via a dashboard hop and dead-end there (todays-plan.tsx:129; review/page.tsx:137,196-203). The Progress hero ring divides by 6236 whole-Quran ayahs and reads ~0% for months (progress/page.tsx:48-62). Long-ayah lessons (2:282 = 14 parts) run ~280 Build reps with no part-chaining, then demand a 128-word cold recall (chunk-phase.tsx:88-91,299-313).

**C — Revision hafiz: architecturally impossible today.** Every funnel pushes C into beginner lessons. The pre-assessment — the feature seemingly built for them — silently discards their hifdh: `getPlanLessons` skips known surahs (plan.ts:133), so they never generate revision tasks or SM-2 cards (cards are only minted at complete-phase.tsx:43 and practice-session.tsx:246). Marking most of a juz known can disable the Next button entirely via a double-count bug (setup/page.tsx:201). The one path that works — Practice → All at Once → self-rate, which mints SM-2 cards and auto-completes lessons (practice-session.tsx:212-264) — is hidden behind a tab and undiscoverable; the /review empty state literally tells C to go do beginner lessons (review/page.tsx:144-155).

**D — Lapsed returner: silently flooded.** No away-detection exists. The header flame shows the stale pre-lapse streak, then silently collapses to 1 on first activity (stats-store.ts:44-73; page.tsx:186-191). A lapsed deadline renders as literally "-5d remaining" with the whole plan counted "behind" (plan.ts:340-346; plan/page.tsx:193-195). All overdue reviews dump into one "Card 1 of 34" session with no cap or framing (review/page.tsx:81-92) — though exit is safe, each rating persists immediately (review-session.tsx:167). Every completed surah becomes a same-day revision task (plan.ts:240-268). Catch-up works mechanically (completing bonus lessons does reduce lessonsBehind) but piles up to 10 lessons into one day and can't touch the review/revision backlog that dominates D's debt (plan-store.ts:158-163).

---

## 3. Systemic issues (root causes)

1. **Three disconnected scheduling systems.** SM-2 cards (exact timestamps, spaced-repetition.ts:61), plan revision (fixed per-surah intervals, plan.ts:214-268), and streak/daily-goal (activity counts on UTC days, stats-store.ts:43-73) never read each other. Explains: contradictory "done today" (B), revisions not feeding health (C), revision floods (D), known surahs invisible to review (C). There is no single "memorized item + strength + next due" model.
2. **No time model beyond "now at user-action".** State mutates only in event handlers, never reconciled on load or day-rollover. Explains: stale-then-reset streak, no lapse detection, negative "-Nd remaining", UTC-vs-local split (stats-store.ts:21-29 vs plan.ts:18-24), and reviews maturing mid-day *after* the user's session (nextReview = exact timestamp, spaced-repetition.ts:29,61,108).
3. **"Already memorized" means hide, not track.** knownSurahIds removes content (plan.ts:133); nothing seeds cards for it. The app cannot represent Quran memorized outside itself.
4. **The retention loop has no closing edge.** No push/notification code exists (public/sw.js is install/activate/fetch only), no day-complete moment, streak decoupled from plan, Essentials records no activity, cloud sync never pitched. An SM-2 product that computes the optimal review moment and can't tell anyone.
5. **Per-word render paths bypass the settings pipeline.** Fill-blank (test-phase.tsx:253-297), word-order chips (chunk-phase.tsx:1044-1083), and Essentials (essential-card.tsx:123-126) hardcode Uthmani + unconditional transliteration, while every AyahDisplay path branches correctly. Root cause: no shared WordText component.
6. **Fixed pedagogy constants, zero adaptation.** 6-4-4-6 reps apply identically to a first-timer and a 14-part 128-word ayah; single-ayah lessons skip chaining and get a one-word test; catch-up is a flat 0-10 clamp.

---

## 4. Findings (deduplicated)

### Blocker

| # | Finding | Evidence | Effort |
|---|---------|----------|--------|
| B1 | "Known" surah = deleted from all revision/review/testing. Pre-assessment discards exactly what Persona C wants scheduled; no revision-first entry point exists anywhere (setup framing, home CTA, /review empty state all funnel to beginner lessons). Fix: known = "skip lessons but seed cards + revision eligibility"; allow a revision-only plan (0 new lessons); surface a "Revise what I know" path. | plan.ts:133; plan.ts:178-268; complete-phase.tsx:43; practice-session.tsx:246; plan-store.ts:59-83; review/page.tsx:144-155 | L |

### Major

| # | Finding | Evidence | Effort |
|---|---------|----------|--------|
| M1 | Setup gate double-subtracts known surahs (`totalLessons - knownSurahIds.length > 0` but totalLessons already excludes them) → Next silently disabled for the heaviest pre-assessment users. Same double-count skews line 628 preview. Fix: `totalLessons > 0`. *(Found independently by 2 audits — one bug.)* | setup/page.tsx:201,628; plan.ts:133 | S |
| M2 | Rest days kill streaks: plan says "Enjoy your rest day", recordActivity resets streak unless lastActiveDate === yesterday. Every Mon–Fri user loses their streak each weekend. | stats-store.ts:60-64; plan.ts:47-50; todays-plan.tsx:83,215-218; setup/page.tsx:51 | M |
| M3 | SM-2 due-times are exact timestamps → a lesson done at 8pm has its review due 8pm tomorrow; morning users see "all done", the plan un-completes at 8pm, every review is effectively a day late. Fix: truncate nextReview to local start-of-day. | spaced-repetition.ts:29,61,108; todays-plan.tsx:39-42,72-75; review/page.tsx:81-84 | S |
| M4 | Streak/stats use UTC days; plan uses local days — day boundaries disagree near midnight. Fix together with M3 via one shared local-date helper. | stats-store.ts:21-29 vs plan.ts:18-24,282-283 | S |
| M5 | Two competing "done today" definitions: dailyGoalActivities ring/streak (any 2 activities) vs plan task list. Streak can grow while the plan is ignored. Unify for plan users. | settings-store.ts:26; page.tsx:83-84,255; stats-store.ts:56-73; todays-plan.tsx:63-75 | M |
| M6 | No day-complete payoff: closure is a silent text flip; Complete screen has no plan/streak/goal awareness; only celebration is 100%-plan (weeks away). | todays-plan.tsx:85; complete-phase.tsx:57-108; plan-celebration.tsx:33 | M |
| M7 | First lesson is 40–50 min: ~70 Build self-report taps (auto-play covers listen/reinforce reps) + 3 required full listens + 3 test levels × 7 ayahs. No time warning, no lighter first-lesson pattern, resume never mentioned. | chunk-phase.tsx:56-61,221-237,299-314; listen-phase.tsx:23; test-phase.tsx:37-50 | L |
| M8 | Test Level 2 (first-letter) renders Arabic-only hints, no transliteration — unusable for a non-reader who was carried by translit everywhere else. | test-phase.tsx:312-330,356-388; contrast :266-297 | M |
| M9 | Translation OFF by default and never surfaced; meaning hidden behind per-ayah taps; onboarding promises "learn the meaning". | settings-store.ts:24; understand-phase.tsx:194-201; ayah-display.tsx:31,94; onboarding-overlay.tsx:49 | S |
| M10 | Default script is multicolor tajweed with the legend collapsed, lesson-header-only, labeled in jargon. | settings-store.ts:21; tajweed-legend.tsx:20-38; lesson-container.tsx:186 | S |
| M11 | Per-word renders ignore script setting: fill-blank test + word-order chips render raw Uthmani (no tajweed/IndoPak branch) — script switches exactly when the user is tested. | test-phase.tsx:253-274,294; chunk-phase.tsx:1044-1083 | M |
| M12 | Stale streak shown on return, then silently resets to 1 mid-session; no on-load reconciliation, no lapse acknowledgment. | stats-store.ts:44-73; page.tsx:186-191 | M |
| M13 | Lapsed deadline renders "-Nd remaining", whole remaining plan counted "behind". Needs a "target date passed — pick a new date / drop deadline" branch; clamp at 0. | plan.ts:340-346; plan/page.tsx:193-195; todays-plan.tsx:107-110 | M |
| M14 | Entire overdue pile in one uncapped session ("Card 1 of 34"), no batching or overdue framing. (Exit is safe — ratings persist per-card — presentation problem, not data trap.) | review/page.tsx:81-92; spaced-repetition.ts:76-80; review-session.tsx:167 | M |
| M15 | Revision flood: every completed surah past interval becomes a same-day task, no per-day cap. | plan.ts:240-268; todays-plan.tsx:145-170 | M |
| M16 | Catch-up piles ≤10 new lessons into one day, can't spread over days, can't clear >10 debt, and ignores the review/revision backlog that dominates a returner's debt. (It *does* reduce lessonsBehind as lessons complete.) | plan-store.ts:158-163; plan.ts:169-172,343-344 | M |
| M17 | Long split-ayah Build (2:282 = 14 parts): full 6-4-4-6 per part (~280 reps), zero part-chaining, then a single 128-word cold "Complete Recitation". Contradicts the app's own progressive-chaining pedagogy. | chunk-phase.tsx:88-91,267-314 | L |
| M18 | Resume mid-surah = manually scrolling 165 lesson cards; no auto-scroll/jump-to-current/lesson search. Compounded by: Continue-card fallback picks first-inserted incomplete lesson (object order), breaking resume on a fresh/synced device. | lesson/[surahId]/page.tsx:148-210; page.tsx:151-156,233-246 | M |
| M19 | Progress hero ring = strong-ayahs/6236, reads ~0% for months; the marquee stat says "you've done nothing". | progress/page.tsx:48-62,152-163 | M |
| M20 | Word-order puzzle wipes ALL progress on any wrong tap — brutal at 21 words × 14 parts. Fix: reject the wrong word only. | chunk-phase.tsx:361-377 | S |
| M21 | Practice mode — the only self-attest path that mints SM-2 cards + auto-completes lessons — is hidden behind a surah/juz tab, never surfaced. If the roadmap rename/kill decision proceeds, this mechanism must survive. | practice-session.tsx:212-264; lesson/[surahId]/page.tsx:92-98; roadmap.md:67-71 | M |
| M22 | Full cloud sync exists (solid 7-store merge) but the account is never pitched; no export/backup; localStorage eviction (iOS PWA) silently erases months of hifdh. Also: onboarding/explainer flags are raw localStorage, unsynced — second device re-onboards. | use-sync.ts:14-22,443-512; user-button.tsx:63-68; onboarding-overlay.tsx:37-65 | M |
| M23 | Zero re-engagement channel: no push/notification code at all, despite hard PWA-install push and web push working in installed PWAs (Android, iOS 16.4+). The SM-2 engine computes optimal timing and cannot tell the user. | public/sw.js; providers.tsx:29-35; roadmap.md:108 | M |

### Minor

| # | Finding | Evidence | Effort |
|---|---------|----------|--------|
| m1 | Zero-lesson user's primary Home CTA is the Planner, not "Start Al-Fatihah"; onboarding's final button dead-ends on Home. | page.tsx:203-218; onboarding-overlay.tsx:63 | M |
| m2 | Onboarding names phases but omits the reassurances that de-intimidate: time estimate, translit/audio crutches, skippability, auto-save. | onboarding-overlay.tsx:37-65 | S |
| m3 | Plan review row links to /review dashboard (2 taps) while lesson rows deep-link (1 tap); review completion dead-ends at "All caught up!" with no onward CTA. | todays-plan.tsx:129; review/page.tsx:137,196-203 | S |
| m4 | Setup preview omits knownLessonIds from the provisional plan → finish-date/pace/lesson-count over-count when partial lessons marked known. | setup/page.tsx:83-96; plan.ts:139; plan-store.ts:73 | S |
| m5 | Deadline-free plans (the default) get NO behind-schedule nudge ever — lessonsBehind is deadline-gated. | plan.ts:340-346; setup/page.tsx:47 | M |
| m6 | Home "Lessons X/Y" tile uses whole-Quran denominator, competing with the plan card's correct scoped progress. *(Downgraded from major — small tile, not headline.)* | page.tsx:159-171,272-275 | S |
| m7 | Overdue reviews indistinguishable from due-today — raw count only. Fix: "X due · Y overdue". | page.tsx:266-270; todays-plan.tsx:127-143 | S |
| m8 | Plan revision screen is "recite + Mark as revised" only — no rating, doesn't feed SM-2/health; revision and review stay disconnected systems. | plan/revise/[surahId]/page.tsx:67-81 | M |
| m9 | No browse-level "I already know this" affordance; toggleKnownSurah only lives in setup/edit (and means hide). | plan-store.ts:116-123; page.tsx:386-417 | M |
| m10 | Understand gate for a 14-part ayah reads "Explore all ayahs (0/1)" for 13 of 14 swipes — no part-level progress. Also "Ayah 1 of 1 · part 1/14" wording is noise. | understand-phase.tsx:76-97,234-236,355-363 | S |
| m11 | Test doesn't scale to a 128-word ayah: fill-blank blanks ONE word and passes 1/1. Run tests at waqf-part granularity for split ayahs. | test-phase.tsx:194-247 | M |
| m12 | Transliteration/translation toggles silently ignored in Essentials (always on) and fill-blank/word-order — the toggle reads as broken once a user turns it off. | essential-card.tsx:123-126; recite-mode.tsx:201-204; test-phase.tsx:266-297; chunk-phase.tsx:1078-1080 | M |
| m13 | Word-tap audio in Understand plays a fixed reference reciter regardless of selection — jarring voice switch on the feature beginners lean on most. | understand-phase.tsx:47-50,119-125 | L |
| m14 | No welcome-back state for a lapsed returner; onboarding is first-time only, no gap detection on Home. | onboarding-overlay.tsx:72-76; page.tsx | M |
| m15 | Essentials is a top-level nav pillar but records no activity — no ring, streak, heatmap, or scheduling credit. The IA trains users it "doesn't count". | bottom-nav.tsx:8-13; no recordActivity in essentials/* | S |
| m16 | The Plan dashboard (pace/deadline/scope controls) hides behind an 11px "Manage" link; Review gets both a nav tab and a plan row (double entry). | todays-plan.tsx:90-95; bottom-nav.tsx:8-13 | S |
| m17 | "Surah" goal type skips pre-assessment while juz/full get it — backwards (hand-picked surahs are MORE likely already known). | setup/page.tsx:177 | S |
| m18 | Surah page still exposes the ambiguous Learn/Practice tab (roadmap terminology cleanup unfinished). | lesson/[surahId]/page.tsx:78-102 | S |
| m19 | "Current Juz" on Progress = most-completed juz, not most-recently-active — can point away from active work. | progress/page.tsx:96-120 | S |

### Polish

| # | Finding | Evidence | Effort |
|---|---------|----------|--------|
| p1 | Build's "Skip to Test" escape is text-xs at the very bottom of the most overwhelming phase. | chunk-phase.tsx:1104-1112 | S |
| p2 | Reciter picker discards its own curated hints ("Slower, beginner-friendly"). | audio.ts:13-16; settings-panel.tsx:174-176 | S |
| p3 | A 128-word ayah counts as "1 ayah" in all stats — effort invisible on the hardest content (word weights exist in ayah-weights.json). | complete-phase.tsx:42-49,72-83 | M |
| p4 | No part-level dots in Build for split ayahs — can't re-drill an earlier part without a full reset. | chunk-phase.tsx:787-845 | M |
| p5 | Build has local speed buttons separate from the persisted playbackSpeed setting — two sources of truth. | chunk-phase.tsx:927-940 | S |

---

## 5. Quick wins (S-effort, high impact — build-ready)

1. **Fix the setup gate**: `setup/page.tsx:201` → `totalLessons > 0`; same double-count at `:628`. Unblocks plan creation for hafiz users. (M1)
2. **Truncate SM-2 nextReview to local start-of-day** in spaced-repetition.ts:29,61,108. Kills the mid-day "un-done" flip. (M3)
3. **One local-date helper**: make stats-store use plan.ts's `todayIso` instead of `toISOString()`. (M4)
4. **Default `translationEnabled: true`** (settings-store.ts:24). (M9)
5. **Default `arabicScript: 'uthmani'`** for new users, or auto-expand the tajweed legend once with a one-line explainer. (M10)
6. **Word-order puzzle: reject only the wrong tap**, keep the correct prefix (chunk-phase.tsx:361-377). (M20)
7. **Onboarding final button deep-links to /lesson/1** (onboarding-overlay.tsx:63). (m1, partial)
8. **Deep-link the plan's review row into a session** (e.g. `/review?start=1`); after session completion, CTA back to remaining plan tasks (todays-plan.tsx:129; review/page.tsx:137). (m3)
9. **Add `knownLessonIds` to the provisional plan** in setup's totalLessons useMemo (setup/page.tsx:83-96). (m4)
10. **Clamp daysRemaining at 0** everywhere (plan/page.tsx:194). (M13, partial)
11. **Split overdue copy**: "X due · Y overdue" on home tile and plan row. (m7)
12. **Part-aware counters**: "Part 3 of 14" instead of "Ayah 1 of 1 · part 3/14"; drive Understand's gate off parts explored. (m10)
13. **Show reciter hints** in the picker: `{r.name} — {r.hint}` (settings-panel.tsx:174-176). (p2)
14. **Time-honesty note on the lesson start card**: "~30–40 min — stop anytime, progress saves." (M7, partial)
15. **recordActivity on Essentials recite completion.** (m15)

---

## 6. What already works — do not touch

- **Transliteration pipeline** is on by default and consistent across Listen/Understand/Build/fill-blank; word-tap always gives audio + meaning regardless of toggles (understand-phase.tsx:340-342).
- **Skip links in every phase** + full-recall always passes — no hard blocks (listen-phase.tsx:226-233; test-phase.tsx:54).
- **Build state persistence & resume**: per-unit unitIndex/stage/repCount saved continuously (chunk-phase.tsx:194-202); Continue card deep-links via lastActivity (page.tsx:221-232).
- **Plan setup defaults**: Juz 30 pre-selected, deadline off, 1/day, graded pace warnings — a plan in 4 taps (setup/page.tsx:36-51,534-548,610-614).
- **recordActivity replay guards** — redoing a lesson doesn't inflate streak/ayahs (complete-phase.tsx:37-50).
- **Practice's self-rate mechanism** (mints SM-2 cards + auto-completes lessons, practice-session.tsx:212-264) — surface it, never delete it.
- **Review dashboard health bars** (Strong/Shaky/Weak per surah, needs-attention sort) — exactly what a reviser wants (review/page.tsx:56-73,249-393).
- **SM-2 forgiveness**: miss resets interval to 1 with kind copy; lesson rated by worst ayah (spaced-repetition.ts:85-87; review-session.tsx:163-165,424).
- **Settings reactivity**: global font-scale CSS var, complete dark-mode token system incl. tajweed tafkhim override, reciter read via getState() at play time (providers.tsx:105-109; globals.css:28-51,255).
- **Plan progression driven by progress-store completedAt**, so practice-completing lessons transparently advances plans (plan.ts:160-194).
- **Data preservation**: plan deletion keeps progress/reviews; longestStreak preserved as "Best" (plan/page.tsx:476-478; progress/page.tsx:194-195).
- **PWA install flow**: iOS-specific instructions, dismissible, non-nagging (install-banner.tsx:62-108).

---

## 7. Open questions for the owner

1. **Known-surah semantics**: confirm "known" should mean *skip lessons but schedule revision* (required for Persona C) before changing plan.ts:133. And: is bulk self-attestation ("I know Juz 30") enough to seed cards, or require one self-rating pass per surah first to avoid false "strong" baselines?
2. **Revision-only plans**: distinct goal type ("maintain my hifdh"), or absorb into the existing planner as a mode?
3. **Practice's fate** (roadmap kill-or-rename): where does the self-rate-to-seed mechanism live afterwards — under Review, or under revision tasks? Should plan revision tasks grade the user and feed SM-2/health, unifying the two systems?
4. **Streak philosophy**: should the streak require plan completion or stay "any 1 activity"? Should rest days auto-protect it (they must, given setup offers them)? Grace/freeze token for a single missed day?
5. **Return policy**: cap/batch size for overdue review sessions? Lapsed deadline → auto-suggest new date, silently drop, or keep pressure? Explicit reduced-first-day "welcome back" mode?
6. **First-session shape**: is 40+ min intentional, or should the first lesson use a reduced rep pattern? Are 45+ word single-ayah lessons meant to be one sitting, or multi-session with part-chaining checkpoints?
7. **Progress hero metric**: move off /6236 to lessons done or word-weighted ayahs?
8. **Web push now vs native later**: roadmap parks notifications for a future native app (roadmap.md:108), but installed-PWA web push works today on Android + iOS 16.4+ — ship a minimal review reminder now?
9. **Essentials**: intentionally exempt from activity/streak credit and translit/translation toggles, or oversight?
10. **Navigation**: should Plan get a bottom-nav slot for plan users (swap Essentials?), given /plan hides behind an 11px "Manage" link?