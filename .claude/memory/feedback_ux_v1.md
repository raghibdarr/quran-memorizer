---
name: V1 UX feedback - quiz-driven vs repetition-driven
description: Core feedback that the app feels like Duolingo/quiz rather than a memorization tool. Build phase needs repetition-driven recitation, not quizzing.
type: feedback
---

The app should feel like structured recitation practice, not a quiz app.

**Why:** Real Quran memorization happens through repeated listening and reciting, not multiple-choice quizzes. The current flow shows briefly then tests, rather than forcing repeated recitation.

**How to apply:**
- Build phase: listen → repeat aloud → repeat → repeat → hide text → recite → check. Audio looping with countdown, not immediate quizzing.
- Hide translations by default in Listen phase (show toggle)
- Hide transliteration during ALL test phases (prevents cheating)
- Simplify Understand phase: remove translation quiz gate, make it browse-only
- First-letter hints: show 2-3 meaningful letters, not connector/silent letters
- Word-ordering is a supplement, not the main learning activity
- Full recall: 3-option self-rating (Forgot/Hard/Easy), not binary
- Must be able to restart/redo completed lessons ("Practice Again" for Build only, "Full Reset" for all phases)
- Transliterations from API use scholarly wasl form, not recitation waqf form — needs manual curation for MVP surahs
