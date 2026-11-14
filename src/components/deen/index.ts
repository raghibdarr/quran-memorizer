// The deen engine's public surface (all-in-one spec 5.6): content packages
// import from here (or the files directly). Names and props are contracts.

export { CitationLine, openExternal } from './citation-line';
export { GradingLine } from './grading-line';
export { PositionsTable, orderPositions, SCHOOL_NAME, SCHOOL_ORDER } from './positions-table';
export { Term, RichText, TermSheet, TermDetails, useGlossary } from './term';
export { ReviewBadge, reviewStatusText } from './review-badge';
export { ReportProblem } from './report-problem';
export { MemoriseFlow, cardsForMemorise, RATING_QUALITY, type MemoriseResult } from './memorise-flow';
export { DepthChoice, resolveDepth, DEPTH_LABEL } from './depth-choice';
export { CueText, ItemArabic } from './cue-text';
export {
  useItemState,
  useDeckStates,
  itemStateOf,
  deckStatesOf,
  ITEM_STATE_LABEL,
  STRONG_INTERVAL_DAYS,
  type ItemState,
} from './item-state';
export { liveDecks, getDeck, getItem, GLOSSARY_DECK, type LiveDeck } from './deck-source';
export { learnHref } from './links';
