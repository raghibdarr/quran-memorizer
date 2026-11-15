import { describe, expect, it } from 'vitest';
import { ambiguousReading, amountText, formatCivilDate, formatGrams, formatMoney, parseAmount } from './format';

describe('ambiguousReading', () => {
  it('says how one separator with three digits after it was read', () => {
    expect(ambiguousReading('1,234')).toBe('1,234');
    expect(ambiguousReading('8,125')).toBe('8,125');
    expect(ambiguousReading('1.234')).toBe('1.234');
    expect(ambiguousReading(' 12,500 ')).toBe('12,500');
  });
  it('is quiet when there is only one reading', () => {
    for (const t of ['', '1234', '12,5', '12.50', '1,234.5', '1.234,56', '1,234,567', '1234,567', 'abc', '1,23a']) {
      expect(ambiguousReading(t), t).toBeNull();
    }
  });
});

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

  it('reads a comma the way it was typed, never dropping a decimal comma', () => {
    // Decimal comma (many phone keyboards): must not become 100 times the amount
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount('12,50')).toBe(12.5);
    expect(parseAmount('0,8')).toBe(0.8);
    expect(parseAmount(',75')).toBe(0.75);
    expect(parseAmount('1.234,56')).toBe(1234.56);
    expect(parseAmount('1 234,56')).toBe(1234.56);
    // Thousands groups
    expect(parseAmount('1,234')).toBe(1234);
    expect(parseAmount('1,234,567')).toBe(1234567);
    expect(parseAmount('12,345.6')).toBe(12345.6);
    // Neither: say so instead of guessing
    expect(parseAmount('1,23,4')).toBeNaN();
    expect(parseAmount('1,2.3,4')).toBeNaN();
    expect(parseAmount(',')).toBeNaN();
  });

  it('reads Arabic-Indic and Persian digits', () => {
    expect(parseAmount('\u0661\u0662\u0663\u0664')).toBe(1234);
    expect(parseAmount('\u0661\u0662\u066b\u0665')).toBe(12.5);
    expect(parseAmount('\u06f1\u06f2\u06f3')).toBe(123);
  });

  it('never returns Infinity', () => {
    expect(parseAmount('9'.repeat(400))).toBeNaN();
  });

  it('formats a civil date without time-zone drift', () => {
    expect(formatCivilDate('2027-03-06')).toBe('Saturday 6 March 2027');
  });
  it('a remembered amount reads back as the same number, with no exponent form', () => {
    for (const n of [0, 0.8, 2345.67, 1250.5, 0.0000001, 1e21, 123456789012]) {
      const t = amountText(n);
      expect(t).not.toMatch(/e/i);
      expect(parseAmount(t)).toBe(n);
    }
    expect(amountText(null)).toBe('');
    expect(amountText(undefined)).toBe('');
    expect(amountText(NaN)).toBe('');
  });
});
