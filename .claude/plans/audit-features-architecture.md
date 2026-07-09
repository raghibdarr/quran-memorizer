# Takrar — Feature & Architecture Audit

**Date:** 2026-07-10 · **Scope:** full feature inventory, architecture review, competitive research (Tarteel, Quranly, Itqan, House of Quran, dedicated hifz tools), hifz-method fidelity, and hard-problem architecture decisions.
**Personas:** **A** beginner (no Arabic script) · **B** daily-habit intermediate · **C** revision-focused hafiz (memorized outside the app) · **D** lapsed returner.

---

## 1. Executive summary

Takrar is in far better shape than its own docs claim. The learning core — Listen/Understand/Build/Test phases with waqf-segment parts, word-timed sliced audio across 5 reciters, SM-2 reviews, a full Hifdh planner, Supabase auth + per-store merge sync, and a hand-rolled but functional PWA layer — is real, mostly solid, and pedagogically correct (imprint first, test after; chunk-and-link drills). The tactile-print UI overhaul gives it a distinct feel neither Tarteel nor Quranly has.

The honest picture:

- **Where it wins:** learning scaffolding depth (word-by-word tiles + tajweed script + sliced audio) beats both market leaders for Persona A; SM-2 + planner serves Persona C, whom Tarteel only reaches through a $99/yr AI paywall and Quranly barely serves at all. Client-side-only Whisper is a genuine privacy differentiator. Reliability + free is a positioning win in a market where both leaders' top complaints are bugs and price.
- **Biggest product gaps:** zero notifications/reminders (fatal for a habit app — Personas B and D), no data export (signed-out users can lose everything to browser eviction), no hide-words/fade-out recall drill (table stakes in every dedicated hifz app), and a review model that is one flat SM-2 queue instead of the sabaq/sabqi/manzil three-tier cycle serious memorizers expect.
- **Biggest technical risks, ranked:** (1) the 633-line untested sync merge — the one place a bug silently corrupts months of memorization data across devices; (2) 4 of 7 stores have no schema version/migration, and signed-out data has no backup path; (3) 2.4 MB full-surah JSON parses for a 5-ayah lesson.
- **Architecture verdicts (details §6):** keep and harden the JSONB-snapshot sync (no CRDTs, no normalization); ship web push via Netlify scheduled function — and note the architect's Tier 0 is already done (manifest exists at `src/app/manifest.ts`, contra the architecture inventory); do **not** start React Native (Capacitor later if triggers fire); spend the whole testing budget on the five highest-ROI targets.

One paragraph of strategy: Takrar should not chase Tarteel's live AI mistake-detection (its most-complained-about feature at $99/yr) nor Quranly's social feed. Its lane is **the method-faithful, beginner-through-hafiz memorization system that is fast, private, free, and doesn't lie to you** — deepen sabaq/sabqi/manzil structure, add the missing recall drills and reminders, and keep self-rating as the source of truth with voice as assistive signal.

---

## 2. Feature inventory (compact)

| Area | Feature | Maturity | Key gap |
|---|---|---|---|
| Home/Nav | Dashboard (surah/juz browse, streak, goal ring, due stats) | solid | — |
| Home/Nav | Fuzzy surah search (tested) | solid | — |
| Home/Nav | Continue / last-activity card | solid | — |
| Lesson | Listen phase (3-listen gate, visualizer, speed) | solid | No repeat-count/pause controls (see §4) |
| Lesson | Understand phase (word tiles, sliced word audio, tajweed) | solid | Meaning-anchoring could go deeper (§5) |
| Lesson | Build/Chunk phase (6-4-4-6, chaining, word-order game) | solid | 1152-line file; single repetition pattern |
| Lesson | Test phase (3 levels, weak-ayah flagging) | solid | No hide/fade-out recall mode (§4) |
| Lesson | Complete phase (card creation, plan hook, replay-guarded) | solid | — |
| Review | Surah-health dashboard | solid | — |
| Review | SM-2 lesson review session (tested lib) | solid | Flat queue; no manzil rotation (§5) |
| Review | Ayah-level review cards | **rough** | Analytics-only; no session consumes them; `addCardsForSurah` unused |
| Practice | Selection + self-rated session | solid | No practice-history UI despite sessions being saved |
| Practice | Whisper voice compare (client-side, real) | **rough** | Display-only, practice-only; CDN-dependent (offline-dead); deprecated ScriptProcessorNode |
| Practice | Juz-level cross-surah practice | solid | Eager-loads all surah data on tab open |
| Planner | Setup wizard (goal/pre-assess/pace/days, tested lib) | solid | — |
| Planner | Dashboard + edit | solid | — |
| Planner | Today's plan card | solid | Ordering not method-aware (§5) |
| Planner | Revision flow (/plan/revise) | **rough** | No recall test/rating/audio — just "Mark as revised"; no sync mount on page |
| Planner | Catch-up + finish celebration | **rough** | Catch-up is a stored flag, doesn't reschedule |
| Essentials | 4 collections, 19 items, search/favorites/tasbih/recite mode | solid | Audio on only 4/19 items; small corpus |
| Progress | Stats, heatmap, timeline, ayah breakdown ring | solid | — |
| Streaks | Streak tracking (v2 migrations) | solid | No freeze/forgiveness; untested date math |
| Settings | Script/font/reciter/dark/goal + CC-BY attribution | solid | — |
| Audio | AudioController + IndexedDB cache + segment slicing | solid | Husary declared for segments but no timing files on disk (silent fallback) |
| Auth | Supabase (email, Google, magic link, reset) + RLS | solid | — |
| Sync | 7-store merge sync (30s/focus/online) | **rough** | Zero tests; `as any` DB cast; mounted only inside UserButton; hard reload on bootstrap |
| PWA | Manifest (`src/app/manifest.ts`) + install banner | solid | Architecture report claiming "no manifest" was wrong — verified present |
| PWA | Service worker (cache-first/SWR/offline.html) | solid | No app-shell precache; cross-origin audio skipped → uncached ayahs silent offline |
| Onboarding | 4-card first-run overlay | solid | No re-onboarding for lapsed returners (§4) |
| **Missing** | Push/local notifications, reminders | **absent** | No Notification/Push code anywhere — the #1 gap |
| **Missing** | Data export/import backup | **absent** | Signed-out users one browser-clear from total loss |

---

## 3. Where Takrar wins today

Honest differentiators against the researched field (Tarteel, Quranly, Itqan, House of Quran, Quran Companion, Al Muhaffiz, et al.):

1. **Learning scaffolding depth for non-Arabic readers (Persona A).** Word-by-word tiles with per-word sliced audio + translation + transliteration, tajweed/IndoPak/Uthmani scripts, and waqf-segment "parts" is richer than anything either market leader exposes. Quranly is plain reading; Tarteel is recite-and-check. No competitor teaches the *inside* of an ayah this way.
2. **The Build phase's 6-4-4-6 chaining is the House-of-Quran "moving window" drill on a modern UI** — the technique serious memorizers use, which the research found no consumer app does well. Takrar already has progressive chaining (A, B, A+B, C, A+B+C) with word-timed audio. This is a real moat; it needs marketing more than building.
3. **The full-pipeline hybrid.** Tarteel = precision without habit-structure; Quranly = habit without memorization rigor. Takrar's phases + SM-2 + planner + streaks is the blend neither offers, and the planner (deadline-derived pacing, rest days, pre-assessment, revision frequency) is more complete than Tarteel's premium "journey."
4. **Privacy-first voice.** Whisper runs entirely on-device in a worker — audio never leaves the phone. Tarteel's model is cloud-dependent and its accuracy is its loudest complaint. "Your recitation never leaves your device" is a one-line differentiator no competitor can copy cheaply.
5. **Free, fast, and web-installable.** Both leaders' top review complaints are technical (lag, crashes, re-login) and price ($99/yr Tarteel, $5/mo Quranly). A polished free PWA with desktop reach (Quranly has none) wins at the margin on reliability alone. The tactile-print design language gives it a distinct identity.
6. **Persona C has no good home elsewhere.** Pre-assessment ("I already know these surahs") + SM-2 review + surah-health analytics serves the revision-hafiz directly; Tarteel serves them only via paid AI, Quranly not at all.
7. **Correct pedagogy, verified.** Research confirms the phase order (imprint → controlled repetition → self-test) and chunk-then-link model match traditional method — Takrar doesn't need to re-architect its core loop, only extend it (§5).

---

## 4. Gap analysis — ranked by persona impact

### 4a. Table stakes we lack (build these; every serious competitor has them)

| # | Gap | Personas | Notes |
|---|---|---|---|
| 1 | **Review reminders / push notifications** | **B, D** (all) | Zero notification code exists. For a streak/SRS app this is load-bearing: an SRS you're never reminded of silently dies. Plan in §6.2. Email digest is the only channel that reaches a fully-lapsed D. |
| 2 | **Data export/import (takrar-backup.json)** | all | One button serializing the 7 store keys; import runs through the sync merge functions. ~1 day. Closes the iOS-Safari-eviction catastrophe for signed-out users. |
| 3 | **Hide-words / fade-out recall drill** | A, B, C | Swipe-to-reveal / masked-text testing exists in nearly every dedicated hifz app (Quran Companion, Al Muhaffiz, Tarteel's Hidden Verses). Takrar's word tiles are perfectly shaped for a per-word fade/hide mode in Test phase and review sessions. Low cost, high credibility. |
| 4 | **Granular audio-repeat controls** (per-ayah/part repeat count, pause interval, A-B loop) | A, B | Baseline set by Ayat, Quran Majeed, House of Quran. The sliced-audio engine already supports it; it's a settings/UI exposure, not an engine build. |
| 5 | **Streak forgiveness (freeze/rest-day awareness)** | B, D | Planner knows rest days but the streak counter doesn't. One earned "freeze" per week of activity, Duolingo-style, capped — forgive by design, not infinitely. |
| 6 | **Real revision flow in the planner** | C, B | `/plan/revise` is display + acknowledge. Reuse the existing review-session recall UI (hide/reveal + rate) so revision actually tests. Also fixes the "revision quality never feeds SM-2" hole. |

### 4b. Differentiators worth building (our lane; few or none do these well)

| # | Feature | Personas | Why us |
|---|---|---|---|
| 1 | **Sabaq/sabqi/manzil three-stream daily plan** (§5) | C, B | The planner already computes new lessons + revisions + due reviews — rename, re-bucket, and enforce "revise before new." Instantly legible to anyone from a traditional hifz background; no polished consumer app frames it this way. |
| 2 | **Mutashabihat (similar-verse) awareness** | C | The #1 advanced failure mode; only Itqan and niche apps address it. Start data-only: ship a known-pairs dataset, surface "this ayah has a twin in X" in Understand/Test, add a side-by-side distinguish drill later. Word-tile UX is ideal for highlighting the one-word difference. |
| 3 | **Lapse-recovery mode** | **D** | Nobody does this well. Detect a gap (>14 days), offer a triaged re-entry: shrink the overdue queue into a catch-up plan, re-run weakest lessons through short consolidation before normal scheduling, restore (don't zero) the emotional state. Builds on existing catch-up + weak-ayah flags. |
| 4 | **Historical weak-spot log** | B, C | Persist per-ayah miss history (Test phase + reviews already rate per ayah) into a "your recurring weak ayat" view. Tarteel paywalls this; Takrar has the data already flowing. |
| 5 | **Voice compare, deepened not gated** | B, C | Extend to review sessions; keep self-rating authoritative (Tarteel's accuracy backlash proves over-promising AI is a trap). Offer "voice suggests: shaky" as a pre-filled rating. Fix offline (self-host model or cache) before expanding. |
| 6 | **Manzil rotation mode** (§5) | C | "Everything memorized cycles every N weeks" layered on SM-2. Genuine differentiation vs every pure-SRS app. |
| 7 | **Ayah-level quick review** | B, C | The ayah cards + store already exist unused — a 5-minute "drill your weakest ayat" session is mostly wiring. |

### 4c. Explicitly NOT worth building (and why)

| Feature | Why not |
|---|---|
| **Real-time word/tashkeel AI mistake detection (Tarteel clone)** | Their moat, their #1 complaint (false positives, accents, noise), and a multi-year model investment. Whisper-base can't do it credibly; over-promising here destroys trust. Assistive voice-compare, yes; live correction, no. Revisit only per roadmap's whisper-large-v3/segmenter note — as a *future* evaluation, not a build. |
| **Social feed / leaderboards / groups** | Heavy lift (new tables, RLS, moderation, privacy) for a solo dev; both competitors do it adequately; many memorizers explicitly want privacy. Roadmap P3 stays parked. Family/khatma sharing only if organic demand appears. |
| **Teacher/madrasa dashboard (Hifz Tracker category)** | A different B2B product with per-student billing, not a feature. Would consume the roadmap whole. |
| **Tafsir library / reflection social network (QuranReflect clone)** | Content licensing + moderation weight. Light meaning-anchoring in Understand (one-line ayah context) captures the retention benefit without becoming a study platform. |
| **Hasanat counters / gems / reward-tier gamification** | Quranly's lane; documented streak-anxiety and metric-gaming risks; tonally wrong for Takrar's calm, method-serious identity. Streaks + heatmap + earned freezes are enough. |
| **React Native rewrite** | See §6.3 — 60% of the effort (UI, audio, animation) is a ground-up rewrite of the most-polished parts, serving personas already reachable on mobile web. |
| **CRDT sync / normalized per-card DB** | See §6.1 — the hand-rolled domain merge *is* the correct CRDT-ish design; a library or normalization adds cost without adding correctness. |

---

## 5. Method-fidelity check

What proven hifz-method concepts the model does and doesn't capture:

**Captured well:**
- **Imprint-first, test-after phase separation** — Listen/Understand/Build before Test matches traditional controlled-repetition-then-self-testing. Confirmed correct by the method research; don't touch.
- **Chunking + linking** — waqf-segment parts and 6-4-4-6 progressive chaining directly implement chunk-then-connect, including the distinct "linking" step (A+B, A+B+C) most apps skip.
- **Daily-plan realities** — target pace, rest days, catch-up, deadline feasibility all exist in the planner and match how real hifz schedules work.
- **Meaning as memory aid** — the Understand phase treats word meaning as part of memorization, which the research confirms is the documented cure for similar-verse confusion, not decoration.

**Partially captured:**
- **Sabaq (new lesson)** — lessons with a 45-word budget ≈ the classic 3–5-line sabaq. ✔ Exists, unnamed.
- **Sabqi (recent consolidation, ~7–20 days)** — SM-2's early interval ladder (1/3/7) approximates it, but nothing *guarantees* daily touch of recent material or distinguishes it from long-term review in the UI.
- **Session ordering** — tradition demands revision *before* new memorization; Today's Plan lists due reviews first but doesn't enforce or even nudge the order.
- **Testing hierarchy** — L1/L2/L3 is good, but lacks the recite-a-full-range-blind test (whole-page/whole-surah flow recall) that whole-page-method memorizers use for flow.

**Not captured:**
- **Manzil (long-term full-corpus rotation).** This is the big one. SM-2 only resurfaces cards whose interval elapsed; the method requires *everything memorized* to cycle on a fixed rotation (~every 1–3 months) regardless of predicted recall. Old-but-not-due surahs silently rot today. A rotation layer ("all memorized material every N weeks") on top of SM-2 fixes it.
- **Mutashabihat.** No similar-verse data, alerts, or drills anywhere. Grows worse the more a user memorizes — precisely Persona C's core pain.
- **Lapse escalation.** SM-2 resets a failed card, but there's no leech detection (chronically-failed ayah → flagged for focused isolated drilling, as a teacher would) and no relearning steps. Anki's lapse machinery is the model.
- **Recitation-in-context prompts** — "use this surah in your next prayer" (roadmap backlog) is the traditional consolidation channel; still absent.

**Verdict:** the *learning* loop is method-faithful; the *retention* loop is a generic SRS. Closing that gap (three-stream framing, manzil rotation, leech escalation, mutashabihat) is the highest-leverage product direction for Personas B and C — and it's mostly scheduling/UI work on top of data that already exists.

**On FSRS:** noted as the better algorithm (20–30% fewer reviews for equal retention). Decision: **defer.** Migrating card state is risky while sync is untested; SM-2 pain only materializes at Persona-C volumes. Sequence it *after* sync hardening + merge tests, and consider it together with the manzil layer as one "retention engine v2" effort. Adopt Anki's leech/relearning ideas first — they're algorithm-agnostic.

---

## 6. Architecture verdicts

Stated as decisions. Default is to adopt the architect's recommendations; amendments are flagged.

### 6.1 Sync — ADOPT in full
Keep per-store JSONB snapshots + domain merge; no CRDTs, no normalized tables. The data is naturally semilattice-shaped and the hand-rolled merge is strictly better than a generic CRDT here. Execute the five hardening moves in order: (1) extract merges to pure `src/lib/sync/merge.ts` + property-based tests (idempotence, commutativity, no-data-loss invariants); (2) version all 7 stores + embed `schemaVersion` in synced payloads with the never-clobber-newer rule; (3) `rev` column + compare-and-set push, replace the `as any` cast with generated DB types; (4) dirty-flag + `lastSyncedAt` in localStorage (not sessionStorage), remove the hard reload on bootstrap; (5) reject anonymous Supabase sign-in, ship export/import instead.
**Amendment (upgrade in priority):** fix the mount bug *first* — `useSync` lives inside `UserButton`, so plan pages (including `/plan/revise`) never sync. Move the hook into `providers.tsx` (gated on session). It's a one-day fix to an active data-loss window and shouldn't wait for the refactor.

### 6.2 Notifications — ADOPT, with Tier 0 amended
**Amendment:** the architect's blocking claim ("no manifest exists, app not installable") is **factually wrong** — `src/app/manifest.ts` is a Next.js metadata route serving a valid manifest (standalone, icons incl. maskable), and the install banner already handles `beforeinstallprompt` + iOS instructions. Verified on disk this audit. Tier 0 therefore shrinks to: confirm `/manifest.webmanifest` serves in prod, add the Badging API (due-count on app icon — free win), and optionally add a 512 maskable icon.
Adopt the rest as specified: `push_subscriptions` table (own-rows RLS, IANA tz + reminder_hour), user-gesture-gated subscribe in settings, SW `push`/`notificationclick` handlers, hourly Netlify scheduled function using `web-push` with the service-role key as Takrar's first server secret, prune dead endpoints, subscription health self-check on app open, and gate the iOS flow on `display-mode: standalone`. Treat push as a nudge, never load-bearing. Add the Tier 2 weekly email digest — it is the only channel that reaches Persona D after the PWA dies. Ship order: badging → Android/desktop push → iOS flow → email.

### 6.3 React Native — ADOPT (i.e., don't)
No RN. The portable 30–40% is the domain core; the other 60% (Tailwind UI, Motion animations, the word-timed audio engine, Whisper worker, IndexedDB cache, SW) is a rewrite of exactly the hardest-won polish. Capacitor is the escape hatch if a trigger fires (store distribution, guaranteed local notifications, unfixable iOS audio jank) — and Takrar's all-client architecture makes `output: 'export'` unusually feasible. Cheap insurance now: keep domain logic DOM-free in `src/lib`, do the sync-merge extraction, keep audio behind the `audio.ts` interface. This matches the roadmap's own "Future / Native App" framing; no change of course needed.

### 6.4 Testing — ADOPT, one addition
Five targets, in order: sync merges (table-driven + fast-check properties), persisted-state golden fixtures per store (pin the progress-store v<2 lesson-discard as a documented decision), streak/DST date math via `vi.setSystemTime` + TZ project, arabic-compare normalization table, and exactly one Playwright smoke (cold load → mini lesson with stubbed audio → reload → progress persisted → review due). Refuse component-test coverage of the 1000-line phase components — they're refactor targets, not test targets. CI: GitHub Actions vitest + `tsc --noEmit` per push; at minimum make Netlify's build `npm run test && npm run build` since pushing main auto-deploys.
**Addition:** when the hide-words drill (§4a-3) ships, fold its assertion into the existing Playwright smoke rather than a new spec.

### 6.5 Decisions the architect didn't rule on
- **Practice vs Learn/Review terminology (roadmap open item):** keep the practice *flow* (it's the entry point for voice compare and Persona C's ad-hoc revision) but finish the rename; fold "practice history" into the progress page or delete the dead session log — don't leave data written that no screen reads.
- **Surah JSON payloads:** adopt range-slicing at the data layer (`getSurahRange(id, from, to)`) or pre-split large surahs into per-lesson chunks at build time. Biggest single performance lever; schedule with the next lesson-flow touch.
- **Whisper CDN dependency:** self-host the transformers runtime + model (or cache via SW) so voice compare isn't silently dead offline/CSP-blocked; remove the unused npm dep either way.

---

## 7. Tech-debt hit list (ranked)

| # | Item | Why it's ranked here | Refs |
|---|---|---|---|
| 1 | **Sync merge: extract + test** | Highest silent-data-corruption surface in the app; blocks every other sync improvement | `src/hooks/use-sync.ts` → `src/lib/sync/merge.ts` |
| 2 | **useSync mounted only in UserButton** | Plan/revise activity doesn't sync until user visits another page — active data-loss window | `use-sync.ts`, `providers.tsx`, `/plan/*` |
| 3 | **4 unversioned stores + no schemaVersion in sync payloads** | Next breaking shape change corrupts local *and* cross-device data with no safety net | `plan/review/practice/essentials-store.ts` |
| 4 | **No export/import backup** | Signed-out users are one browser-clear/eviction from losing everything | new settings action, ~1 day |
| 5 | **Full-surah JSON loads (2.4 MB for a Baqarah lesson)** | Biggest performance lever; hits Persona A's first-lesson experience on mobile data | `src/lib/quran-data.ts:38`, `src/data/surah-2.json` |
| 6 | **`chunk-phase.tsx` (1152 lines)** | Prime refactor target; blocks safe iteration on the app's core drill; extract the step state machine into a hook/lib | `src/components/lesson/phases/chunk-phase.tsx` |
| 7 | **Streak date math untested** | DST/timezone bug breaking a 200-day streak is a trust catastrophe for Persona B | `stats-store.ts` getToday/getYesterday |
| 8 | **`as any` DB cast on sync path** | Unchecked column access exactly where correctness matters most; fix via `supabase gen types` | `use-sync.ts:8-10` |
| 9 | **Hard `window.location.reload()`s** (sync bootstrap, providers migration) | Hostile mid-lesson, races the SW; replace with store rehydration | `use-sync.ts:574`, `providers.tsx:42` |
| 10 | **SM-2 duplication** (`processReview`/`processLessonReview`, `getDueCards`×2, STORE_NAMES×2, merge tiebreak×2) | Drift between near-identical copies = silent scheduling divergence | `spaced-repetition.ts:35,82`, `use-sync.ts:14` |
| 11 | **Husary segment reciter declared but no timing files on disk** | Silent fallback to full-ayah audio; either add the files or remove from `SEGMENT_AUDIO_RECITERS` | `segment-audio.ts`, `public/segments/` |
| 12 | **Deprecated ScriptProcessorNode in recorder** | Will break in a future browser release; migrate to AudioWorklet | `use-recorder.ts` |
| 13 | **Dead `@huggingface/transformers` npm dep + "tiny" comment loading "base"** | Dep confusion; misleading comment on the voice path | `package.json`, `whisper-worker.ts:25` |
| 14 | **Stale `.claude/CLAUDE.md`** | Claims "no backend auth, all localStorage" — predates auth/sync/planner/essentials/voice; misleads every future session | `.claude/CLAUDE.md` |
| 15 | **Unused surfaces:** ayah review cards (no session UI), practice history (written, never read), `addCardsForSurah` | Either wire them (§4b-7) or delete; unread persisted data is sync weight + confusion | `review-store.ts`, `practice-store.ts` |

---

*Inputs: feature inventory + architecture inventory (2026-07-10), competitor research (Tarteel/Quranly; dedicated hifz apps; methods/SRS references), architect hard-problem recommendations. Manifest finding independently verified against `src/app/manifest.ts` during this audit.*
