# Hifdh Curriculum Planner — Comprehensive Spec

## Overview

A structured memorization planner that generates personalised daily plans based on user goals. Sits on top of the existing lesson and review systems — it tells users *what* to do each day rather than leaving them to pick ad-hoc.

---

## 1. Goal Setting

### Goal Types

Users choose what they want to memorize:

| Goal Type | Example | How it maps to lessons |
|-----------|---------|----------------------|
| Single surah | "I want to memorize Surah Al-Mulk" | All lessons for that surah |
| Multiple surahs | "Al-Mulk, Ar-Rahman, Ya-Sin" | All lessons for each, in order |
| A juz | "Juz 30" | All lessons across all surahs in that juz |
| Multiple juz | "Juz 29 and 30" | All lessons across all surahs in those juz |
| Full Quran | "I want to memorize the entire Quran" | All 6236 ayahs, all surahs, all lessons |
| Custom range | "Surahs 78-86" | All lessons for surahs in range |

### Deadline (Optional)

- **With deadline**: "I want to finish by [date]". App calculates required pace.
- **Without deadline**: User sets their own pace (default: 1 new lesson/day).

### Pre-Assessment

Before generating the plan, ask: "Do you already know any of these surahs?"
- Show a checklist of surahs in the goal
- User ticks ones they already know
- Ticked surahs are excluded from the plan (but still available for review)
- Can also partially tick: "I know the first 3 lessons of An-Naba" (stretch goal — V1 just does full surahs)

---

## 2. Plan Structure

### Curriculum Order

Within a goal, lessons are ordered:
- **Within a surah**: Sequential (Lesson 1, 2, 3...)
- **Across surahs in a juz**: By surah order within the juz (traditional mushaf order)
- **Across juz**: Juz 30 first (shortest surahs), then 29, 28... or traditional order (user choice?)

Default: Start with the shortest/easiest surahs within the selected scope. This matches how hifdh is traditionally taught.

### Daily Plan Composition

Each day's plan consists of:

1. **Reviews** (mandatory, always first)
   - All SM-2 due lesson cards for the day
   - These come from the existing review system — non-negotiable
   - Estimated count shown: "3 reviews due"

2. **Revision** (woven in periodically)
   - Full surah/passage recitation of previously completed surahs
   - Frequency: every N days per surah (configurable, default: weekly for recent, biweekly for older)
   - "Revise Al-Fatihah (full surah)" — user recites the whole thing, self-rates
   - This is different from SM-2 reviews (which are per-lesson) — this is full-surah recall

3. **New Lessons** (based on pace)
   - Next unlearned lesson(s) in the curriculum sequence
   - Count based on pace setting (1-5 per day)
   - Only shown after reviews are done (or in parallel — user choice)

### Pace Calculation

**With deadline:**
```
total_lessons = (lessons in goal) - (already completed) - (pre-assessed known)
days_remaining = deadline - today
lessons_per_day = ceil(total_lessons / days_remaining)
```
Clamped to max 5/day. If impossible (would need >5/day), warn at setup: "This goal requires X lessons/day which is very ambitious. Consider extending your deadline."

**Without deadline:**
- User sets lessons/day via stepper (1-5, default 1)
- Projected finish date shown: "At this pace, you'll finish in ~X days (around [date])"

### Rest Days

- User configures which days they study (default: every day)
- Options: every day, weekdays only, custom (pick days)
- Rest days: no new lessons scheduled, but reviews still show (they're time-sensitive)
- Pace calculation adjusts for rest days:
```
study_days_remaining = count of study days between today and deadline
lessons_per_study_day = ceil(total_lessons / study_days_remaining)
```

---

## 3. Data Model

### Plan Store (`src/stores/plan-store.ts`)

```typescript
interface HifdhPlan {
  id: string;
  createdAt: number;
  
  // Goal definition
  goalType: 'surah' | 'surahs' | 'juz' | 'multi-juz' | 'full-quran' | 'custom-range';
  goalSurahIds: number[];        // Resolved list of surah IDs in order
  deadline: string | null;       // ISO date or null for no deadline
  
  // Pre-assessment
  knownSurahIds: number[];       // Surahs user already knows (excluded from new lessons)
  
  // Pacing
  lessonsPerDay: number;         // 1-5
  studyDays: number[];           // 0=Sun, 1=Mon, ... 6=Sat (which days to study)
  
  // Progress tracking
  completedLessonIds: string[];  // Lessons completed within this plan
  currentLessonIndex: number;    // Index into the ordered lesson list
  
  // Revision schedule
  revisionFrequencyDays: number; // How often to revise completed surahs (default: 7)
}

interface PlanState {
  plan: HifdhPlan | null;
  
  // Actions
  createPlan: (config: PlanConfig) => void;
  deletePlan: () => void;
  updatePace: (lessonsPerDay: number) => void;
  updateDeadline: (deadline: string | null) => void;
  updateStudyDays: (days: number[]) => void;
  markLessonCompleted: (lessonId: string) => void;
  
  // Computed
  getTodaysPlan: () => TodaysPlan;
  getProgress: () => PlanProgress;
}

interface TodaysPlan {
  reviews: LessonReviewCard[];           // Due SM-2 reviews
  revisions: SurahRevision[];            // Full surah revision tasks
  newLessons: LessonDef[];               // New lessons to learn today
  isRestDay: boolean;
  isComplete: boolean;                   // All tasks done for today
}

interface SurahRevision {
  surahId: number;
  surahName: string;
  lastRevised: number;                   // Timestamp
  daysSinceRevision: number;
}

interface PlanProgress {
  totalLessons: number;
  completedLessons: number;
  percentage: number;
  lessonsRemaining: number;
  projectedFinishDate: string;           // ISO date
  daysRemaining: number;
  isOnTrack: boolean;                    // true if current pace meets deadline
  lessonsBehind: number;                 // 0 if on track, positive if behind
  currentPace: number;                   // actual lessons/day over last 7 days
}
```

---

## 4. UI Components

### Plan Setup Flow (`src/app/plan/setup/page.tsx`)

Multi-step form:

**Step 1: What to memorize**
- Goal type selector (cards): Single Surah, Juz, Multiple Juz, Full Quran
- Based on selection, show surah/juz picker
- For surah: searchable dropdown
- For juz: grid of Juz 1-30
- For multiple: multi-select

**Step 2: Pre-assessment**
- "Do you already know any of these?"
- Checklist of surahs in the goal, all unchecked by default
- Skip button: "I'm starting fresh"

**Step 3: Pacing**
- "Do you have a target date?" toggle
- If yes: date picker + auto-calculated pace shown
- If no: lessons/day stepper (1-5) + projected finish date shown
- Study days: day-of-week toggles (S M T W T F S), all selected by default
- "You'll also review previously learned material each day"

**Step 4: Confirmation**
- Summary card: "Memorize Juz 30 (X lessons) by [date]"
- "X new lessons/day, reviews as needed"
- "Study days: Mon-Fri"
- "Start Plan" button

### Today's Plan Card (`src/components/plan/todays-plan.tsx`)

Shown on home page when a plan is active. Visually distinct from other cards:
- Header: "Your Plan" with a small progress bar (overall % complete)
- Checklist items:
  - [ ] Review Al-Fatihah L1 (due)
  - [ ] Review An-Nas L2 (due)
  - [ ] Revise Al-Ikhlas (full surah)
  - [ ] Learn An-Naba L4
- Each item tappable → navigates to the relevant lesson/review
- Items check off as completed
- Rest day state: "Rest day — reviews only" or "All done for today!"
- Behind schedule alert: "2 lessons behind schedule" with option to catch up

### Plan Dashboard (`src/app/plan/page.tsx`)

Dedicated page for plan management:
- **Progress ring**: Large circle showing overall % complete
- **Stats**: Lessons done / total, days remaining, current pace, projected finish
- **On-track indicator**: Green "On track" or yellow "2 behind" or red "Falling behind"
- **Pace adjuster**: Stepper to change lessons/day
- **Deadline adjuster**: Change or remove deadline
- **Study days**: Toggle days
- **Revision settings**: Frequency slider
- **Surah progress list**: Each surah in the plan with lesson completion bars
- **Delete plan**: With confirmation

### Navigation

- Plan setup: `/plan/setup` (multi-step form)
- Plan dashboard: `/plan` (management + stats)
- Today's Plan card: on home page (`/`) when plan is active
- No new bottom nav tab — plan is accessed from the home page card or a header icon

---

## 5. Plan Integration with Existing Systems

### Home Page Changes

When a plan is active:
```
[Today's Plan card]        ← NEW, visually prominent
[Daily goal ring | Due Reviews | Lessons X/Y]  ← existing stats
[Surahs/Juz tabs + grid]  ← existing, unchanged
```

When no plan:
```
[Continue Learning card]   ← existing
[Stats grid]               ← existing
[Surahs/Juz tabs + grid]  ← existing
```

### Lesson Completion Hook

When a lesson is completed (via lesson flow or practice auto-complete):
- If a plan is active and the lesson is in the plan: `markLessonCompleted(lessonId)`
- Update plan progress
- If all today's tasks are done: show celebration / "All done for today!"

### Review System

No changes to SM-2 — the plan just surfaces due reviews at the top of the daily plan. The review system operates independently.

### Revision System (New)

Separate from SM-2 reviews. Full-surah revision:
- Tracked per-surah: `lastRevisedAt` timestamp
- Plan generates revision tasks when `daysSinceRevision >= revisionFrequencyDays`
- Revision flow: navigate to surah practice page, recite the whole thing, self-rate
- After revision: update `lastRevisedAt`
- Frequency increases as user progresses (more surahs = more revisions)

### Conflict: Off-Plan Learning

If a user completes a lesson that's not in their plan:
- No effect on the plan — plan only tracks its own lessons
- The lesson still counts for stats, streaks, reviews, etc.
- If the lesson happens to be the "next" lesson in the plan sequence, it gets marked complete in the plan too

---

## 6. Edge Cases

### Goal is impossible
"Memorize Juz 30 by tomorrow" → Show warning at setup: "This would require X lessons/day. We recommend at most 5/day. Consider extending your deadline to [suggested date]."

### User finishes early
All plan lessons completed before deadline → "Congratulations! You finished ahead of schedule. Your reviews will continue automatically."

### User wants to change goal mid-plan
Allow editing the goal (add/remove surahs, change deadline). Recalculates pace. Completed lessons are preserved.

### User has multiple devices
Plan stored in Zustand with persist. When sync is implemented, plan syncs via the same `user_data` Supabase table (add `quran-plan` to STORE_NAMES in use-sync.ts).

### Rest days stack up
If user takes more rest days than configured, the pace recalculation handles it — projectedFinishDate adjusts automatically.

### Pre-assessed surahs change
If a user marked a surah as "known" but later wants to learn it: they can edit the plan's pre-assessment, which adds those surahs back into the lesson queue.

---

## 7. Implementation Order

1. **Plan store** — data model, persistence, computed helpers (getTodaysPlan, getProgress)
2. **Plan setup flow** — multi-step form at `/plan/setup`
3. **Today's Plan card** — home page integration
4. **Plan dashboard** — `/plan` management page
5. **Revision system** — surah-level revision tracking + integration into daily plan
6. **Lesson completion hook** — auto-mark plan lessons on completion
7. **Sync** — add `quran-plan` to sync store names
8. **Behind-schedule notifications** — alert banners

### Estimated scope
- Store + types: ~150 lines
- Setup flow: ~300 lines (4 steps)
- Today's Plan card: ~100 lines
- Dashboard: ~250 lines
- Revision system: ~100 lines
- Integration hooks: ~30 lines
- Total: ~930 lines across ~8 files

---

## 8. Future Enhancements (Not V1)

- Multiple concurrent plans
- Collaborative plans (study group with shared progress)
- AI-optimised ordering (based on surah difficulty, user performance)
- Push notification reminders ("You haven't practiced today")
- Calendar export (add study sessions to Google Calendar)
- Streak freeze (like Duolingo — use a "freeze" to keep streak on a missed day)

---

## 9. Files to Create/Modify

| File | Action | Purpose |
|------|--------|---------|
| `src/types/quran.ts` | Modify | Add HifdhPlan, TodaysPlan, PlanProgress types |
| `src/stores/plan-store.ts` | Create | Plan state, actions, computed helpers |
| `src/app/plan/setup/page.tsx` | Create | Multi-step plan setup flow |
| `src/app/plan/page.tsx` | Create | Plan dashboard + management |
| `src/components/plan/todays-plan.tsx` | Create | Home page daily plan card |
| `src/components/plan/plan-progress.tsx` | Create | Progress ring + stats for dashboard |
| `src/components/plan/pace-settings.tsx` | Create | Pace/deadline/study days controls |
| `src/app/page.tsx` | Modify | Show Today's Plan card when plan active |
| `src/components/lesson/phases/complete-phase.tsx` | Modify | Hook into plan on lesson completion |
| `src/components/practice/practice-session.tsx` | Modify | Hook into plan on practice auto-complete |
| `src/hooks/use-sync.ts` | Modify | Add quran-plan to sync store names |
