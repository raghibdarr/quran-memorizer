# HifzFlow — Quran Memorization App

Beginner-focused Quran memorization web app targeting Juz Amma.
Guided multi-phase learning flow: Listen → Understand → Chunk → Test → Spaced Review.

## Tech Stack
- Next.js 16 (App Router), TypeScript, Tailwind CSS v4
- Zustand for state management
- localStorage/IndexedDB (idb-keyval) for V1 (no backend)
- Fonts: Scheherazade New (Arabic), Plus Jakarta Sans (UI)

## Commands
- `npm run dev` — Start dev server
- `npx next build` — Production build
- `npx tsx scripts/fetch-quran-data.ts` — Re-fetch Quran data from API (uses QUL transliteration JSON from src/data/english-transliteration-tajweed.json)

## Project Structure
- `src/app/` — Next.js pages (home, lesson/[surahId], review, progress)
- `src/components/` — UI (ui/, lesson/phases/, layout/)
- `src/stores/` — Zustand stores (progress, review, settings, stats)
- `src/lib/` — Pure logic (audio, spaced-repetition, chunks, curriculum, quran-data)
- `src/data/` — Static JSON (surah data fetched from quran.com API v4)
- `src/types/quran.ts` — All TypeScript type definitions

## Design Tokens
- Colors: cream (#FEFCF9), teal (#1B4D5C), gold (#C8963E), success (#2D7A4F), muted (#8A8A85)
- Arabic text: use `arabic-text` CSS class (RTL, Scheherazade New font, line-height 2.2)
- Mobile-first layout, max-w-lg centered content

## Key Conventions
- Mobile-first design (375px base)
- Arabic text uses dir="rtl" and Scheherazade New font
- Self-assessment over AI voice recognition
- No backend auth for V1 — all state in localStorage

## Reference
- Full product spec: `.claude/app-spec-context.md`
