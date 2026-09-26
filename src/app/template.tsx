import { ViewTransition } from 'react';

// Screen transitions (M11b). A root TEMPLATE (not the layout) remounts on every
// top-level route change, so its <ViewTransition> sees each screen enter and
// exit. Direction comes from the navigation's transition type (src/lib/nav.ts):
// push slides the new screen in from the right over the old one receding under a
// scrim; pop reverses it; tab switches crossfade. Untyped navigations — browser
// back, hardware back, swipe — use `nav-auto`, which globals.css animates only
// when the document is marked as going back (src/lib/nav-history.ts).
const MAP = { 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', 'nav-tab': 'nav-tab', default: 'nav-auto' };

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition enter={MAP} exit={MAP} default="none">
      <div data-screen>{children}</div>
    </ViewTransition>
  );
}
