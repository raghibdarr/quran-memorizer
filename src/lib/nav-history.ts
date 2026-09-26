'use client';

// In-app history stack (M11b) — what "back" means inside Takrar. The browser's
// history can't be inspected, and a back button that PUSHES the parent route
// piles up entries (hardware back then walks "forward" through them). With this
// stack, back pops when the previous in-app screen is really behind us, and only
// falls back to navigating to the parent when the app was opened deep (a
// notification, a reload inside the native shell).

const KEY = 'nav-history';
const MAX = 50;

function read(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function write(stack: string[]) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(stack.slice(-MAX)));
  } catch { /* ignore */ }
}

/** Record that `url` is now showing: a return to the previous entry pops, anything else pushes */
export function recordNavigation(url: string) {
  const stack = read();
  if (stack[stack.length - 1] === url) return;
  if (stack[stack.length - 2] === url) stack.pop();
  else stack.push(url);
  write(stack);
}

export function canGoBack(): boolean {
  return read().length > 1;
}

/**
 * Browser-initiated back (hardware back button, swipe, history) carries no React
 * transition type — mark the document so the CSS pop animation plays instead.
 * Cleared once the transition has had time to run.
 */
let clearTimer: ReturnType<typeof setTimeout> | null = null;
export function markGoingBack(kind: 'back' | 'swipe' = 'back') {
  document.documentElement.dataset.navDir = kind;
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    delete document.documentElement.dataset.navDir;
  }, 700);
}

type VTDocument = Document & { startViewTransition?: (cb: () => Promise<void>) => { finished: Promise<void> } };

/**
 * Go back one history entry WITH the pop animation. React renders history
 * traversals (popstate) synchronously — deliberately, for scroll restoration —
 * so its <ViewTransition> never runs for them. Here the view transition is
 * started by hand around history.back(): snapshot, traverse, snapshot, animate
 * (globals.css styles the root snapshots under <html data-nav-dir>).
 */
export function animatedHistoryBack(kind: 'back' | 'swipe' = 'back') {
  const doc = document as VTDocument;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) {
    history.back();
    return;
  }
  document.documentElement.dataset.navDir = kind;
  const before = document.querySelector('[data-screen]');
  const transition = doc.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        // Resolve once the previous screen has actually been swapped in (the root
        // template remounts). Timers, not requestAnimationFrame: rendering is
        // suppressed while this callback is pending, so rAF would never fire.
        const started = performance.now();
        const poll = () => {
          const swapped = document.querySelector('[data-screen]') !== before;
          if (swapped || performance.now() - started > 450) resolve();
          else setTimeout(poll, 16);
        };
        history.back();
        setTimeout(poll, 16);
      }),
  );
  transition.finished.finally(() => {
    delete document.documentElement.dataset.navDir;
  });
}
