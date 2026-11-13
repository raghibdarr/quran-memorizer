// Display helpers for the zakat screen. The currency is free text the user
// picks ('£', 'GBP', 'Rs'); it is shown as typed, never converted.

const number = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "£1,234.50" for a one-character symbol, "1,234.50 GBP" for a code, "1,234.50" for none */
export function formatMoney(n: number, currency = ''): string {
  const c = currency.trim();
  const v = number.format(Number.isFinite(n) ? n : 0);
  if (!c) return v;
  return [...c].length === 1 ? `${c}${v}` : `${v} ${c}`;
}

/** "85 g", "87.48 g" */
export function formatGrams(g: number): string {
  return `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(g)} g`;
}

/**
 * A typed amount as a number: accepts "1,234.5", " 12 ", "0.75"; an empty
 * field is null; anything else (negative, letters) is NaN so the field can say so.
 */
export function parseAmount(text: string): number | null {
  const t = text.replace(/[,\s]/g, '');
  if (t === '') return null;
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return NaN;
  return Number(t);
}

/** "Saturday 6 March 2027" for a civil date (built from parts: ICU versions differ on the comma) */
export function formatCivilDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(
    new Date(Date.UTC(y, m - 1, d)),
  );
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`;
}
