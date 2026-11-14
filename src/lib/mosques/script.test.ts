import { describe, expect, it } from 'vitest';
import { fitsAppArabicFace, isArabicScript } from './script';

describe('isArabicScript', () => {
  it('goes by the first letter', () => {
    expect(isArabicScript('مسجد الراجحي')).toBe(true);
    expect(isArabicScript('(١) مسجد')).toBe(true);
    expect(isArabicScript('مسجد امام خمینی')).toBe(true);
    expect(isArabicScript('East London Mosque')).toBe(false);
    expect(isArabicScript('Masjid الفاروق')).toBe(false);
    expect(isArabicScript('')).toBe(false);
    expect(isArabicScript('123')).toBe(false);
  });
});

describe('fitsAppArabicFace', () => {
  it('Arabic names fit; Persian and Urdu letters do not', () => {
    expect(fitsAppArabicFace('مسجد الراجحي')).toBe(true);
    expect(fitsAppArabicFace('جامع الإمام تركي بن عبدالله')).toBe(true);
    expect(fitsAppArabicFace('مسجد ١٢')).toBe(true);
    expect(fitsAppArabicFace('مسجد پیامبر')).toBe(false);
    expect(fitsAppArabicFace('بادشاہی مسجد')).toBe(false);
    expect(fitsAppArabicFace('مسجد گوهرشاد')).toBe(false);
  });
});
