# Hands-on persona tests — 2026-09-26

Six blind usability runs of the current build (static export, 390×844 touch viewport, Playwright-driven,
screenshots judged as a user would see them). Unlike the July audit (`audit-ux-flows.md`, a code
walk-through), these USED the app end to end. Screenshots: session scratchpad `ux/<persona>/`.

| Persona | Goal | Headline |
|---|---|---|
| Amina — absolute beginner | first surah, first lesson | Al-Fatihah is ONE lesson: ~45–55 min, ~20 reps/ayah; she'd quit ~10–12 min in |
| Yusuf — partial hafiz | plan that respects what he knows | plan set up on a rest day opened on "Enjoy your rest day" — nothing to do; "known" contradicts itself |
| Bilal — commuter, 10 min | today's reviews, fast | 1 tap to first card (great); then 7–9 taps per card, 2 sessions, lesson with no time estimate: day ≈ 18–20 min |
| Maryam — just recite/listen | recite Al-Mulk, listen, a dua | tools exist but are buried 5–7 taps deep in a "Review" tab framed as grading lessons |
| Hamza — lapsed 5 weeks | come back without being crushed | welcome-back copy excellent; the numbers shame him (30 overdue, 81 behind, 0/day) and the day never ended |
| Uncle Tariq — 64, low vision | bigger Indo-Pak text, revise Yasin | rating buttons hidden under the bottom bar; Back loses the review; no script/size step |

Onboarding (asked for explicitly): 4 skippable slides, no permissions or sign-in (good). Scores 2/5
(hafiz, reciter), 3.5/5 (beginner), 5/10 (elder). Every persona hit the same mismatch: the last slide says
"Pick your first surah" but "Start Learning" drops you into an Al-Fatihah lesson. Slides are all about the
lesson method; nobody is asked what they came to do, and script/text size are never offered.

## Fixed the same day (committed)

- Re-entry revisions chained forever ("1 task left" ×4) — revisions done today now count (`plan.ts`, tested)
- "Plan complete" shown at 27% of the plan → only when no lessons remain; else "Nothing left for today"
- Rest day offers the next lesson as optional extra instead of a dead end
- Essentials "Recite all" controls were under the tab bar; review/lesson icon buttons unlabeled → labeled
- Settings/Account sheets get a "Done" button
- Double day-complete celebration (lesson screen + Home sheet) → one
- **Tajweed glyph**: U+0672 in the tajweed source (1,561× across 87 surahs) drew as a broken box in the
  DEFAULT script → normalized to U+0670 at load (tested)
- **Word challenge resume** showed no chips — a hard dead end → seeded shuffle on resume
- Build explainer promised 4 steps / "one last time" (really 5 steps, 6 final recalls) → generated from config
- "Chunk Phase" → "Build step"; "1 lessons" / "1 repetitions"; flipped ellipsis

## What's left — grouped, with a recommendation each

### 1. Lesson length (biggest quit risk) — NEEDS OWNER DECISION
Evidence: beginner ~45–55 min for Al-Fatihah; commuter can't fit a lesson in 10 min; no time estimate or
natural stopping point anywhere. M9 already plans a lighter first-lesson pattern + part-chaining.
Recommendation: (a) show an honest per-lesson time estimate on every lesson entry point; (b) "good place
to stop" checkpoints every 2–3 ayahs inside Build (progress already saves — make stopping feel intended,
not like quitting); (c) rep presets — "Standard" lighter than today's 6-4-4-6 (e.g. 4-3-3-4) as the
default, "Thorough" = today's pattern; first-ever lesson lighter still (M9). Re-cutting lessons smaller
changes lessonIds and orphans progress — avoid unless (b) proves insufficient.

### 2. Onboarding asks what you came for — NEEDS OWNER DECISION (recommend yes)
One question: "New to memorizing / I've memorized some / Revise what I know / Just read & listen". It
routes (beginner → pick Al-Fatihah or a short surah; memorized-some → plan setup with known-surahs first;
revise/listen → recite surface), sets Home's lead card, and precedes a script + text-size step with a live
Quran line preview. Cut the "Spaced Review" slide (show it after the first completed lesson).

### 3. A first-class Recite / Listen surface — NEEDS OWNER DECISION (recommend yes)
Every surah page leads with three actions: **Listen**, **Recite from memory**, **Learn**. Listen =
continuous playback that auto-scrolls and highlights, player out of the text's way. Recite = hidden text,
tap-to-peek per ayah, hear-the-correct-ayah, rating OPTIONAL (feeds scheduling only when given). The
bottom-nav Review empty state stops telling a hafiz to "complete lessons first".

### 4. One daily queue — NEEDS OWNER DECISION (recommend yes)
"Start today" runs Sabqi → Manzil → new lesson without bouncing to Home, with "about N min left". Faster
rating: one "All good" for a passage, reveal-as-you-rate, Submit/Next pinned above the player; "Next
Lesson" inside reviews → "Next review". A review interrupted by Back resumes (elder lost his).

### 5. One truth for "known" and for backlog numbers — can proceed without a decision
- Attested-known surahs show as "Shaky"/48 shaky ayahs before any rating; plan page says "Revisions kick
  in once you finish your first surah" while Home lists their revisions; Progress says 0 surahs started;
  a known surah's page offers "Start Lesson ~20–40 min". → one model: "In revision", no strength label
  until rated, known surahs listed on the plan page, "Relearn" instead of "Start".
- Invented dates: "Last revised 19 Sept" / "7d since last" for a plan created today (staggered seed dates
  surface as history). → show "Not revised yet in Takrar" until a real revision.
- Returner: one backlog number, framed kindly, on every surface ("20 waiting — folded in over 3 days");
  no "overdue"/"Nd since last" during easing; tomorrow's forecast honest and capped; plan page offers the
  re-date choice instead of "81 lessons behind · 0 lessons/day"; the suggested date stops creeping daily.
- "0/2 Today" before a plan exists is unexplained.

### 6. Accessibility pass — can proceed without a decision
Grey subtitles to ≥4.5:1 contrast; tap targets ≥44px (Sign in 62×28, speed 32×24, Skip 49×28, sort chips
34px, Learn/Review 36px); text size beyond 160% with a live preview; review rating pinned above the bar and
the surah header collapsed during sessions; plain-language pass on "Hifdh Planner", "Due Reviews",
"Shaky", "Build", "By Range", "Ayah by Ayah", "1x".

### 7. Smaller items
Test L1 wrong tap auto-advances (fat-finger → "Review & Retry" back to Build); test level progress not
restored on reload; "Retry with Weak Flagged" is primary even with one shaky ayah; plan-setup day toggles
"S M T W T F S" ambiguous; known-surah list order + no range select; search misses "Yasin sharif";
tajweed legend auto-open on first view reads as jargon to a beginner (owner chose auto-open in July —
revisit alongside #2); Essentials: 3 adhkar, audio on one item.

## Suggested sequencing
§5 + §6 + §7 next (no decisions needed). §2–§4 become the revised M9 once the owner answers; §1 merges
into M9's existing first-lesson work.

## Status 2026-09-27 (owner: "implement them and point them out to me")

Owner decisions: keep 6-4-4-6, but allow skipping a single step or ayah; implement §2-§4; humanize
the copy (em dashes). All done and committed:
- §1 Build: "Skip this step", "I know this ayah, skip it", "Skip chaining"; a "progress saved, good
  place to stop" note with Stop for now at each new ayah; honest per-lesson time estimates
  (`lesson-time.ts`) on surah/juz lists, the single-lesson card, the plan row and onboarding
- §2 Onboarding: intent question → script + size with a real-ayah preview → hand-off (first surah
  with times / plan setup / revision plan preset / Listen); Home lead card follows the intent;
  Continue card above the planner pitch
- §3 Recite (`/recite?s=N`, rating optional) and Listen (`/listen?s=N`, follow-along) from every surah
  page; surah "Review" tab renamed "Practice"; Review empty state points to Recite
- §4 "Start today · ~N min" run (reviews → revisions → new lesson, `today-run.ts`); review shows the
  text after "I've recited it", one-tap "All good", "The rest were fine", pinned Submit/Next
- §5 returner numbers: "N more later" during re-entry, easing-aware tomorrow forecast, re-date choice
  on the plan page, "None this week" instead of "0 lessons/day"
- Copy pass: 74 strings, no em-dash crutches

Still open: Test phase rethink (owner question, proposal in chat), multi-part lesson "stop points"
beyond Build, the smaller §7 items (L1 wrong-tap penalty, test-level resume, known-surah list order
and range select).
