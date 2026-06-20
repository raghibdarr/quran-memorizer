# UI Overhaul — Tactile Print

Date: 2026-06-10. Direction agreed in design review: evolve the existing cream/teal/gold
manuscript palette toward a **tactile print** look (riso/print warmth) rather than adopting
neubrutalism or claymorphism. Story: riso = print = paper = mushaf.

## Design language

- **Warm-ink borders** (`--c-ink`, #36332C light / light hairline in dark) on tactile elements — never pure black
- **Solid offset shadows** (no blur): 4px teal-tinted on cards, 3px ink on buttons; shadows
  collapse + element translates on `:active` (press physics). Dark mode: shadow colors go
  transparent, depth comes from tonal lift (`--c-card-raised`) + hairline borders ("print on slate")
- **Contrast fix**: text on teal/gold/success/miss fills uses `on-teal`/`on-gold`/`on-success`/`on-miss`
  tokens (white-on-pastel-cyan in dark mode failed WCAG at ~2.7:1)
- **Tasbih beads** (`BeadProgress`) replace dot/bar progress for small counts (reps, listens, review cards)
- **Color roles**: teal = active/current · gold = earned/complete (stepper, milestones) ·
  green = "got it" ratings only · miss = warm terracotta (not pure red)
- **Paper grain**: fixed full-screen SVG noise at ~3% opacity (multiply light / screen dark)
- **Medallions**: surah numbers in rotated-square gold diamonds (ayah-marker motif)
- Flashcard stack visual on review session (stacked edges behind the active card)

## Tokens (globals.css)

`--c-ink`, `--c-on-teal/gold/success/miss`, `--c-gold-deep` (readable gold text on light),
`--c-card-raised`, `--c-miss`, `--shadow-card-color/btn-color/chip-color` (transparent in dark).
Utility classes: `.ink-border`, `.tactile-card`, `.tactile-btn`, `.tactile-chip`, `.pressable`,
`.scrollbar-hide`; keyframes `bead-pop`, `phase-in`.

## Component changes

- `ui/button.tsx` — primary/secondary get tactile borders + offset shadows + press physics
- `ui/card.tsx` — `variant: 'quiet' | 'tactile'` (quiet = hairline border, fixes dark-mode slab soup),
  `pressable` prop
- `ui/bead-progress.tsx` — NEW: tasbih-bead progress (≤10 beads, auto-fallback to bar)
- `ui/rating-buttons.tsx` — NEW: shared Got it / Hesitated / Missed chips (review + practice)
- `ui/phase-indicator.tsx` — completed = gold (was Duolingo-green), active = teal
- `layout/bottom-nav.tsx` — taller, `env(safe-area-inset-bottom)`, 22px icons, press feedback
- `ui/media-controls-bar.tsx` — tactile container, sits above taller nav, token sweep
- `app/layout.tsx` — `viewport` export with `viewportFit: 'cover'` + themeColor

## Screen passes

- **Home** — hero continue/planner card (tactile, replaces border-l-4 accent stripes), quiet stat
  tiles, sort chips row (scrollbar hidden + mask fade + bigger targets), segmented toggle restyle,
  surah cards with diamond medallion numbers
- **Build (chunk-phase)** — decluttered: big heading removed (stepper already says Build), step
  instruction is the single heading, ayah nav row compacted, skip link moved to bottom, ayah card
  leads, reps = beads; word-order chips + explainer modal restyled
- **Listen** — counter uses beads, ayah cards quiet variant
- **Review** — "Card x of y" pill + beads, card-stack reveal prompt, shared rating chips
- **Practice** — tactile main card, shared rating chips, results restyle

Not in scope this pass (inherit tokens/primitives only): progress page, plan pages, essentials,
settings panel, auth modal, onboarding overlay. Terminology cleanup (Practice→?) untouched —
separate roadmap item.

## Dark mode tuning (2026-06-10, follow-up)

Original dark used transparent offset shadows on a near-black `#141414` page — the tactile
depth was invisible. Fix: black offset shadows only read against a lifted surface, so the page
was lifted and cards lifted above it.
- `--bg`/`--c-cream`: `#141414` → `#1C1C1A`; `--c-card`: `#1E1E1E` → `#272725`;
  `--c-card-raised`: `#2D2D29`; `--c-ink` (dark hairline) `0.30` → `0.42` alpha
- Dark shadow tokens are now real black (`rgba(0,0,0,0.5–0.7)`), not transparent
- Dropped the `.dark .tactile-card { background: card-raised }` override (it was killing the
  gold tint on the home planner card and would clobber active-state tints)

### List-card tier
`.tactile-raise-sm` = 2px offset shadow only; pair with `border-[1.5px] border-ink` (full
tactile cards use 4px). Applied to the stacked rateable ayah cards in listen / review /
practice-full-passage so they match the rating chips inside them (was: plain hairline, read as
unfinished). Build-phase chain cards intentionally keep their dashed/tinted memory-test states.

## Understand phase — 3D card deck (Motion, 2026-06-15)

Added `motion` (^12.40, formerly Framer Motion) — first animation dependency. The Understand
phase is a real `preserve-3d` flashcard deck (`understand-phase.tsx`):
- Container has `perspective` + `transform-style: preserve-3d`; two decorative back-edge divs sit
  at negative `translateZ` so the active card genuinely renders *behind* them.
- **Cycling-carousel model** (evolved from AnimatePresence → slot-window → this). Renders ALL
  ayahs in the lesson (lessons are ~5 ayahs), each at `STACK_SLOTS[cyclicOffset]` where
  `cyclicOffset = (idx - ayahIndex + N) % N` (0 = front, growing downward, largest = bottom =
  PREVIOUS ayah). The whole deck springs to new slots on nav: next sends the top card to the back
  of the deck, prev sweeps the bottom (previous) card up to the top. This made prev legible —
  the one-sided "upcoming-only" stack had nothing visible to pull from on prev.
- An invisible sizer (current ayah's face) gives the absolutely-positioned cards their height.
  Each card is `overflow-hidden` so a taller behind-ayah's text can't bleed out of its box.
- `drag="x"` throwable (elastic, constraints 0/0), `onDragEnd` uses offset+velocity → goNext/goPrev.
- **Button presses get a throw-arc** (`ARC_TRANSITION` + `arcKeyframes`): the one big-mover card
  passes through a 3-keyframe waypoint so a button feels like a throw, not a straight recede.
  Direction-specific waypoints: `ARC_WP_NEXT` flings the card LEFT (mimics the drag-left throw)
  before the carousel sweeps it to the back; `ARC_WP_PREV` rises UP + toward the viewer as the
  previous card comes from the back to the top. Drags keep the plain spring (`nav.viaButton` gates
  it). Arcs are memoized (`nextArc`/`prevArc`) so unrelated re-renders don't restart a mid-arc.
  (Verified mid-flight via in-page rAF transform sampling — eval latency is too variable to catch
  a sub-second animation by screenshot; slow it to ~15s + sample `.style.transform` over time.)
- Fan kept shallow + a `pb-8` spacer below the deck so 7+ stacked cards don't reach the word list.
- `SPRING`/`ARC_TRANSITION` (speed) and `STACK_SLOTS`/`ARC_WP` (positions) are the tuning knobs.
- `overflow-x-clip` on lesson `<main>` still guards horizontal overflow (nav-pop fix).
- Debugging tip that paid off: temporarily set SPRING to a ~2.6s tween to screenshot a real
  mid-shuffle frame — that's how the discard-spills-into-words and text-bleed bugs were caught.

Caveat: the drag *gesture* couldn't be verified via scripted events (Motion needs real frame-timed
velocity) — needs a device/mouse test. Navigation + transitions + build all verified.
RN migration note: Motion is web-only; on React Native this becomes Reanimated/Moti (logic ports,
the choreography concept transfers).

## Notes

- Pre-overhaul working tree (audio refactor, uncommitted) snapshotted as git `stash@{0}`
  "pre UI overhaul snapshot 2026-06-10" — tracked files only.
- RN portability: solid offset shadows are trivial in React Native; press physics map to
  Pressable + transform.
