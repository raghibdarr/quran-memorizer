// Honest lesson-length estimates (persona tests, 2026-09): "~20–40 min" on every
// lesson was wrong for most of them, and a user can't plan a session without a
// real number. Modelled on what a lesson actually asks, per ayah of `w` words:
//
//   audio a ≈ w × SEC_PER_WORD (recitation incl. elongation and the gap between files)
//   Listen      3 plays of the whole passage
//   Understand  a short look at every ayah
//   Build       6-4-4-6: 20 recitations (+ the pause or self-check after each)
//               + the word challenge, and chaining after every ayah but the
//               first and last
//   Test        one recital of the whole lesson, checking and rating each ayah
//
// Calibrated against a timed walkthrough of Al-Fatihah (≈35 min for an
// average learner); the range covers faster and slower learners.

const SEC_PER_WORD = 1.5;
const LISTEN_PLAYS = 3;
const UNDERSTAND_SEC_PER_AYAH = 15;
const BUILD_OVERHEAD_SEC_PER_AYAH = 70; // pauses + self-checks across the 20 reps
const WORD_CHALLENGE_SEC = (w: number) => 8 + 1.5 * w;
const CHAIN_OVERHEAD_SEC = 15;
const TEST_CHECK_SEC_PER_AYAH = 5; // reveal, compare, rate
const TEST_OVERHEAD_SEC = 20;
const RANGE = [0.85, 1.2] as const;

export function estimateLessonSeconds(wordCounts: number[]): number {
  const audio = wordCounts.map((w) => w * SEC_PER_WORD);
  const passage = audio.reduce((s, a) => s + a, 0);

  let build = 0;
  let accumulated = 0;
  audio.forEach((a, i) => {
    build += 20 * a + BUILD_OVERHEAD_SEC_PER_AYAH + WORD_CHALLENGE_SEC(wordCounts[i]);
    accumulated += a;
    const isFirst = i === 0;
    const isLast = i === audio.length - 1;
    if (!isFirst && !isLast) build += accumulated + CHAIN_OVERHEAD_SEC; // chain so far
  });

  return (
    LISTEN_PLAYS * passage +
    UNDERSTAND_SEC_PER_AYAH * wordCounts.length +
    build +
    passage + TEST_CHECK_SEC_PER_AYAH * wordCounts.length + TEST_OVERHEAD_SEC
  );
}

/** "~8 min" or "~30–40 min" — whole minutes under 10, otherwise the nearest 5 */
export function formatLessonTime(wordCounts: number[]): string {
  const minutes = estimateLessonSeconds(wordCounts) / 60;
  const snap = (m: number) => (m < 10 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5);
  const low = snap(minutes * RANGE[0]);
  const high = Math.max(low, snap(minutes * RANGE[1]));
  return low === high ? `~${low} min` : `~${low}–${high} min`;
}
