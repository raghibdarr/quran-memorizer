// Navigation model for the native-feeling shell (M11b). Pure: no DOM, no router.
//
// Every screen has a DEPTH in the app's hierarchy. Moving deeper is a push
// (slide in from the right), moving shallower is a pop (slide back), and moving
// between the four tab roots is a tab switch (crossfade) — the same grammar as
// a native stack navigator.

export const NAV_FORWARD = 'nav-forward';
export const NAV_BACK = 'nav-back';
export const NAV_TAB = 'nav-tab';

const TAB_ROOTS = new Set(['/', '/review', '/essentials', '/progress']);

function pathOf(href: string): string {
  const q = href.search(/[?#]/);
  const path = q === -1 ? href : href.slice(0, q);
  return path.length > 1 ? path.replace(/\/+$/, '') : path || '/';
}

/** 0 = tab root, 1 = a section's detail (surah, juz, plan, collection), 2 = a flow (lesson, revision, session, setup) */
export function routeDepth(href: string): number {
  const path = pathOf(href);
  if (TAB_ROOTS.has(path)) return 0;
  if (/^\/(learn|recite|listen|review\/session|plan\/(revise\/\d+|setup|edit))$/.test(path)) return 2;
  return 1;
}

/** Transition types for navigating from the current path to `href` (for Link / router.push) */
export function navTransitionTypes(fromHref: string, toHref: string): string[] {
  const from = pathOf(fromHref);
  const to = pathOf(toHref);
  if (from === to) return [];
  const a = routeDepth(from);
  const b = routeDepth(to);
  if (a === 0 && b === 0) return [NAV_TAB];
  if (b < a) return [NAV_BACK];
  return [NAV_FORWARD];
}

/** Whether a screen is a full-screen flow that hides the tab bar */
export function isFullScreenFlow(href: string): boolean {
  return routeDepth(href) === 2;
}
