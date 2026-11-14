// The zakat calculation (all-in-one spec 2.2, 6). Pure: no store, no clock, no
// network. Money is in the user's own currency; metals are in grams, valued at
// the prices per gram the user typed in (no openly licensed price feed exists).
//
// What it does not do is decide anything that the schools decide differently.
// Worn jewellery and debts each need the user's choice before they count, and
// the result is worked out on BOTH nisab bases so the screen can show the
// difference instead of picking one.

import type { NisabBasis } from '@/stores/zakat-store';

/** One fortieth, on wealth held for a lunar year */
export const ZAKAT_RATE = 0.025;

/**
 * Nisab in grams under the two common reckonings of 20 mithqal of gold and 200
 * dirhams of silver. Attribution and the arithmetic behind each live in
 * src/data/zakat-notes.json ('nisab-grams').
 */
export const NISAB_GRAMS = {
  /** A dinar (mithqal) of 4.25 g and a dirham of 2.975 g */
  dinar: { gold: 85, silver: 595 },
  /** 7.5 tola of gold and 52.5 tola of silver, a tola of 11.664 g */
  tola: { gold: 87.48, silver: 612.36 },
} as const;

export type Reckoning = keyof typeof NISAB_GRAMS;

/** Every amount the calculator asks for, by the field id stored in zakat-store.inputs */
export const ZAKAT_FIELDS = [
  'cash',
  'goldGrams',
  'goldWornGrams',
  'silverGrams',
  'silverWornGrams',
  'tradeGoods',
  'receivables',
  'debts',
] as const;

export type ZakatField = (typeof ZAKAT_FIELDS)[number];

/** Option ids stored in zakat-store.options */
export const ZAKAT_OPTIONS = {
  /** 'include' | 'exclude': count gold and silver jewellery that is worn */
  wornJewellery: 'worn-jewellery',
  /** 'deduct' | 'keep': take debts off before comparing with nisab */
  debts: 'debts',
  /** 'dinar' | 'tola': which gram figures stand for the nisab */
  reckoning: 'reckoning',
  /** 'on': a local reminder on the expected end of the zakat year */
  hawlReminder: 'hawl-reminder',
} as const;

export type WornChoice = 'include' | 'exclude';
export type DebtChoice = 'deduct' | 'keep';

export interface ZakatInput {
  amounts: Partial<Record<ZakatField, number>>;
  prices: { gold: number | null; silver: number | null };
  reckoning: Reckoning;
  /** null: not chosen yet */
  wornJewellery: WornChoice | null;
  /** null: not chosen yet */
  debts: DebtChoice | null;
}

/** Why a result can't be given yet, in the order the screen asks for them */
export type Missing = 'gold-price' | 'silver-price' | 'worn-choice' | 'debt-choice';

export interface BasisResult {
  basis: NisabBasis;
  /** Nisab in money, or null without that metal's price */
  nisab: number | null;
  status:
    | 'incomplete' // something in `missing` is needed first
    | 'nothing' // nothing entered
    | 'below-nisab'
    | 'at-or-above-nisab';
  /** Zakat at 2.5% of `net`; 0 unless at or above nisab */
  due: number;
}

export interface ZakatResult {
  /** Money value of each asset line, as counted (worn jewellery as chosen) */
  lines: { cash: number; gold: number; silver: number; tradeGoods: number; receivables: number };
  /** Sum of the lines */
  assets: number;
  /** Debts taken off (0 unless the user chose to deduct them) */
  deducted: number;
  /** assets - deducted, never below 0 */
  net: number;
  missing: Missing[];
  gold: BasisResult;
  silver: BasisResult;
}

/** Money rounded to the cent, half away from zero, without float drift (1.005 → 1.01) */
export function roundMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return (sign * Math.round(Number((Math.abs(n) * 100).toPrecision(15)))) / 100;
}

const amt = (n: number | null | undefined): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0);

/** Nisab in money for a basis, or null without that metal's price */
export function nisabValue(basis: NisabBasis, prices: ZakatInput['prices'], reckoning: Reckoning = 'dinar'): number | null {
  const price = prices[basis];
  if (price === null || !Number.isFinite(price) || price <= 0) return null;
  return roundMoney(NISAB_GRAMS[reckoning][basis] * price);
}

export function calculateZakat(input: ZakatInput): ZakatResult {
  const a = input.amounts;
  const goldPrice = amt(input.prices.gold);
  const silverPrice = amt(input.prices.silver);
  const wornCounts = input.wornJewellery === 'include';
  const goldGrams = amt(a.goldGrams) + (wornCounts ? amt(a.goldWornGrams) : 0);
  const silverGrams = amt(a.silverGrams) + (wornCounts ? amt(a.silverWornGrams) : 0);

  const missing: Missing[] = [];
  // A metal's price is needed to value holdings of it, and for its own basis (added below)
  const needsGold = amt(a.goldGrams) > 0 || (input.wornJewellery !== 'exclude' && amt(a.goldWornGrams) > 0);
  const needsSilver = amt(a.silverGrams) > 0 || (input.wornJewellery !== 'exclude' && amt(a.silverWornGrams) > 0);
  if (!goldPrice && needsGold) missing.push('gold-price');
  if (!silverPrice && needsSilver) missing.push('silver-price');
  if (input.wornJewellery === null && (amt(a.goldWornGrams) > 0 || amt(a.silverWornGrams) > 0)) missing.push('worn-choice');
  if (input.debts === null && amt(a.debts) > 0) missing.push('debt-choice');

  const lines = {
    cash: roundMoney(amt(a.cash)),
    gold: roundMoney(goldGrams * goldPrice),
    silver: roundMoney(silverGrams * silverPrice),
    tradeGoods: roundMoney(amt(a.tradeGoods)),
    receivables: roundMoney(amt(a.receivables)),
  };
  const assets = roundMoney(lines.cash + lines.gold + lines.silver + lines.tradeGoods + lines.receivables);
  const deducted = input.debts === 'deduct' ? roundMoney(Math.min(amt(a.debts), assets)) : 0;
  const net = roundMoney(Math.max(0, assets - deducted));
  const entered = ZAKAT_FIELDS.some((f) => f !== 'debts' && amt(a[f]) > 0);

  const forBasis = (basis: NisabBasis): BasisResult => {
    const nisab = nisabValue(basis, input.prices, input.reckoning);
    if (!entered) return { basis, nisab, status: 'nothing', due: 0 };
    if (missing.length || nisab === null) return { basis, nisab, status: 'incomplete', due: 0 };
    if (net < nisab) return { basis, nisab, status: 'below-nisab', due: 0 };
    return { basis, nisab, status: 'at-or-above-nisab', due: roundMoney(net * ZAKAT_RATE) };
  };

  return { lines, assets, deducted, net, missing, gold: forBasis('gold'), silver: forBasis('silver') };
}

/** Builds the calculator's input from zakat-store's persisted shape */
export function inputFromStore(s: {
  inputs: Record<string, number>;
  options: Record<string, string>;
  pricePerGram: { gold: number | null; silver: number | null };
}): ZakatInput {
  const worn = s.options[ZAKAT_OPTIONS.wornJewellery];
  const debts = s.options[ZAKAT_OPTIONS.debts];
  const amounts: Partial<Record<ZakatField, number>> = {};
  for (const f of ZAKAT_FIELDS) if (typeof s.inputs[f] === 'number') amounts[f] = s.inputs[f];
  return {
    amounts,
    prices: s.pricePerGram,
    reckoning: s.options[ZAKAT_OPTIONS.reckoning] === 'tola' ? 'tola' : 'dinar',
    wornJewellery: worn === 'include' || worn === 'exclude' ? worn : null,
    debts: debts === 'deduct' || debts === 'keep' ? debts : null,
  };
}
