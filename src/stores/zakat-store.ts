'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// The zakat calculator's inputs (all-in-one spec 3.2). Device-only; rides in the
// backup file. Field ids are owned by src/lib/zakat (cash, goldGrams, …), so the
// zakat screen can add a field without changing this store's shape.

export const ZAKAT_STORE_KEY = 'takrar-zakat';
export const ZAKAT_STORE_VERSION = 1;

export type NisabBasis = 'gold' | 'silver';

export interface ZakatData {
  /** Amounts by field id: money in the user's currency, metals in grams */
  inputs: Record<string, number>;
  /** Choices where positions differ (e.g. worn jewellery), by question id */
  options: Record<string, string>;
  nisabBasis: NisabBasis;
  /** User-entered prices per gram (no price feed exists that we may use) */
  pricePerGram: { gold: number | null; silver: number | null };
  /** Free text the user picks ('GBP', '£'); display only */
  currency: string;
  /** The day the user's wealth first reached nisab (start of the lunar year) */
  hawlStartIso: string | null;
}

interface ZakatActions {
  setInput: (id: string, value: number | null) => void;
  setOption: (id: string, value: string | null) => void;
  setNisabBasis: (basis: NisabBasis) => void;
  setPrice: (metal: 'gold' | 'silver', perGram: number | null) => void;
  setCurrency: (currency: string) => void;
  setHawlStart: (iso: string | null) => void;
  resetInputs: () => void;
}

export type ZakatState = ZakatData & ZakatActions;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const amount = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null);

export function defaultZakatData(): ZakatData {
  return { inputs: {}, options: {}, nisabBasis: 'silver', pricePerGram: { gold: null, silver: null }, currency: '', hawlStartIso: null };
}

/** Repairs any persisted or imported shape (idempotent) */
export function sanitizeZakatData(raw: unknown): ZakatData {
  const s = (raw ?? {}) as Record<string, unknown>;
  const inputs: Record<string, number> = {};
  for (const [k, v] of Object.entries((s.inputs ?? {}) as Record<string, unknown>)) {
    const n = amount(v);
    if (n !== null) inputs[k] = n;
  }
  const options: Record<string, string> = {};
  for (const [k, v] of Object.entries((s.options ?? {}) as Record<string, unknown>)) {
    if (typeof v === 'string') options[k] = v;
  }
  const price = (s.pricePerGram ?? {}) as Record<string, unknown>;
  return {
    inputs,
    options,
    nisabBasis: s.nisabBasis === 'gold' ? 'gold' : 'silver',
    pricePerGram: { gold: amount(price.gold), silver: amount(price.silver) },
    currency: typeof s.currency === 'string' ? s.currency.slice(0, 12) : '',
    hawlStartIso: typeof s.hawlStartIso === 'string' && ISO.test(s.hawlStartIso) ? s.hawlStartIso : null,
  };
}

export function migrateZakat(persisted: unknown, version: number): ZakatData {
  void version; // v1 is the first version
  return sanitizeZakatData(persisted);
}

export const useZakatStore = create<ZakatState>()(
  persist(
    (set) => ({
      ...defaultZakatData(),
      setInput: (id, value) =>
        set((s) => {
          const inputs = { ...s.inputs };
          const n = amount(value);
          if (n === null) delete inputs[id];
          else inputs[id] = n;
          return { inputs };
        }),
      setOption: (id, value) =>
        set((s) => {
          const options = { ...s.options };
          if (value === null) delete options[id];
          else options[id] = value;
          return { options };
        }),
      setNisabBasis: (basis) => set({ nisabBasis: basis === 'gold' ? 'gold' : 'silver' }),
      setPrice: (metal, perGram) => set((s) => ({ pricePerGram: { ...s.pricePerGram, [metal]: amount(perGram) } })),
      setCurrency: (currency) => set({ currency: currency.slice(0, 12) }),
      setHawlStart: (iso) => set({ hawlStartIso: iso && ISO.test(iso) ? iso : null }),
      resetInputs: () => set({ inputs: {}, options: {} }),
    }),
    {
      name: ZAKAT_STORE_KEY,
      version: ZAKAT_STORE_VERSION,
      migrate: (p, v) => migrateZakat(p, v) as never,
      // Every rehydrate goes through the sanitizer, not only a version change: a
      // same-version value of the wrong shape (a newer build's id, a partial write)
      // must fall back to defaults rather than crash the screens that read it
      merge: (persisted, current) => ({ ...current, ...sanitizeZakatData(persisted) }),
      partialize: ({ inputs, options, nisabBasis, pricePerGram, currency, hawlStartIso }) =>
        ({ inputs, options, nisabBasis, pricePerGram, currency, hawlStartIso }),
    },
  ),
);
