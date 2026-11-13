import { describe, expect, it } from 'vitest';
import { formatCivilDate, formatGrams, formatMoney, parseAmount } from './format';

describe('zakat formatting', () => {
  it('formats money with the user\'s own currency text', () => {
    expect(formatMoney(1234.5, '£')).toBe('£1,234.50');
    expect(formatMoney(1234.5, 'GBP')).toBe('1,234.50 GBP');
    expect(formatMoney(0.1)).toBe('0.10');
    expect(formatMoney(NaN, '$')).toBe('$0.00');
  });

  it('formats grams', () => {
    expect(formatGrams(85)).toBe('85 g');
    expect(formatGrams(612.36)).toBe('612.36 g');
  });

  it('parses typed amounts', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('  ')).toBeNull();
    expect(parseAmount('1,234.5')).toBe(1234.5);
    expect(parseAmount('.75')).toBe(0.75);
    expect(parseAmount('-3')).toBeNaN();
    expect(parseAmount('12abc')).toBeNaN();
    expect(parseAmount('.')).toBeNaN();
  });

  it('formats a civil date without time-zone drift', () => {
    expect(formatCivilDate('2027-03-06')).toBe('Saturday 6 March 2027');
  });
});
