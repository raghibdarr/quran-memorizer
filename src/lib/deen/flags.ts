// Owner switches for deen content (all-in-one spec 5.6).

/**
 * Fiqh lessons (the course) are source-checked by agents but not yet reviewed by
 * a scholar, and primer citations can't be machine-verified. While this is true
 * the course shows, with its visible "Not yet reviewed by a scholar" status.
 * Set it to false to hold the course back until a named reviewer has seen it.
 */
export const SHOW_UNREVIEWED_FIQH = true;

/** The status line every unreviewed item carries (spec 1.8) */
export const UNREVIEWED_STATUS = 'Source-checked. Not yet reviewed by a scholar.';

/** The footer under every fiqh lesson (spec 1.7) */
export const ASK_A_SCHOLAR = 'For your own situation, ask a scholar you trust.';
