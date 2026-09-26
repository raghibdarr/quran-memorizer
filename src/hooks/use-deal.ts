'use client';

import { useEffect, useState, type CSSProperties } from 'react';

/** Rows past this index share the last delay — off-screen rows must not queue behind visible ones */
const STAGGER_CAP = 12;
/** After this, the container is "settled": rows mounted later appear without dealing */
const SETTLE_MS = 1200;

/**
 * Dealt-in lists (M11 accent 1). Returns container props and a per-row style:
 *
 *   const deal = useDeal(tab);
 *   <div key={tab} {...deal.container}>{rows.map((r, i) => <Row className="deal-in" style={deal.row(i)} />)}</div>
 *
 * A change of `dealKey` (with the container re-keyed so its rows remount)
 * deals again — e.g. a tab switch, or data arriving. Tilt, travel, stagger
 * and duration are the --dial-deal-* dials in globals.css.
 */
export function useDeal(dealKey: string | number = 0) {
  const [settledKey, setSettledKey] = useState<string | number | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setSettledKey(dealKey), SETTLE_MS);
    return () => clearTimeout(t);
  }, [dealKey]);
  const settled = settledKey === dealKey;
  return {
    container: { 'data-deal-settled': settled ? '' : undefined } as Record<string, string | undefined>,
    row: (i: number): CSSProperties =>
      ({ '--deal-i': Math.min(i, STAGGER_CAP), '--deal-sign': i % 2 === 0 ? -1 : 1 }) as CSSProperties,
  };
}
