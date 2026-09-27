// What the user said they came for (onboarding, 2026-09-27). Decides where
// onboarding hands off and what Home leads with. Per device, like other
// first-run choices; absent = never answered (skipped or onboarded earlier).

export type Intent = 'learn' | 'memorized-some' | 'revise' | 'listen';

const KEY = 'user-intent';
const INTENTS: Intent[] = ['learn', 'memorized-some', 'revise', 'listen'];

export function getIntent(): Intent | null {
  try {
    const v = localStorage.getItem(KEY);
    return INTENTS.includes(v as Intent) ? (v as Intent) : null;
  } catch {
    return null;
  }
}

export function setIntent(intent: Intent) {
  try {
    localStorage.setItem(KEY, intent);
  } catch { /* ignore */ }
}
