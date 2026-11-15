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
 *
 * Many phone keyboards give a comma as the decimal key, so a comma is read the
 * way it was most likely meant and never silently dropped: "12,5" and "12,50"
 * are 12.5, "1.234,56" is 1234.56, and "1,234" or "1,234,567" (groups of
 * three) are thousands. Anything else with a comma ("1,23,4") is NaN.
 */
export function parseAmount(text: string): number | null {
  // Arabic-Indic and Persian digits and separators, as their keyboards type them
  let t = text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/\u066c/g, ',')
    .replace(/[\s\u00a0\u202f]/g, '');
  if (t === '') return null;
  if (t.includes(',')) {
    if (/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(t)) t = t.replace(/,/g, ''); // 1,234 · 1,234,567.8
    else if (/^\d{1,3}(\.\d{3})+,\d*$/.test(t)) t = t.replace(/\./g, '').replace(',', '.'); // 1.234,56
    else if (/^\d*,\d*$/.test(t)) t = t.replace(',', '.'); // 12,5 · ,75
    else return NaN;
  }
  if (!/^\d*\.?\d*$/.test(t) || t === '.') return NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * How an amount with one separator and exactly three digits after it was read,
 * or null when the text has only one reading. "1,234" is taken as a thousand
 * and "1.234" as a decimal, but a writer who uses the comma as the decimal mark
 * (or the dot for thousands) means the opposite, so the field says which it took.
 */
export function ambiguousReading(text: string): string | null {
  if (!/^\s*[\d\u0660-\u0669\u06f0-\u06f9]{1,3}[.,\u066b\u066c][\d\u0660-\u0669\u06f0-\u06f9]{3}\s*$/.test(text)) return null;
  const n = parseAmount(text);
  if (n === null || Number.isNaN(n)) return null;
  return n.toLocaleString('en', { maximumFractionDigits: 3 });
}

/**
 * A remembered amount as the text of its field: plain digits, never the
 * exponent form String() gives very small or very large numbers ("1e-7"),
 * which parseAmount would then reject on the next visit.
 */
export function amountText(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  return n.toLocaleString('en', { useGrouping: false, maximumFractionDigits: 20 });
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
