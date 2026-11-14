import { describe, expect, it } from 'vitest';
import { calculateZakat, inputFromStore, nisabValue, NISAB_GRAMS, roundMoney, ZAKAT_RATE, type ZakatInput } from './calc';

const base = (over: Partial<ZakatInput> = {}): ZakatInput => ({
  amounts: {},
  prices: { gold: 100, silver: 1 },
  reckoning: 'dinar',
  wornJewellery: null,
  debts: null,
  ...over,
});

describe('nisab', () => {
  it('is grams times the price per gram for each basis and reckoning', () => {
    expect(nisabValue('gold', { gold: 100, silver: 1 })).toBe(8500);
    expect(nisabValue('silver', { gold: 100, silver: 1 })).toBe(595);
    expect(nisabValue('gold', { gold: 100, silver: 1 }, 'tola')).toBe(8748);
    expect(nisabValue('silver', { gold: 100, silver: 1 }, 'tola')).toBe(612.36);
  });

  it('needs the price', () => {
    expect(nisabValue('silver', { gold: 100, silver: null })).toBeNull();
    expect(nisabValue('gold', { gold: 0, silver: 1 })).toBeNull();
  });

  it('keeps the reckonings as stated', () => {
    expect(NISAB_GRAMS.dinar).toEqual({ gold: 85, silver: 595 });
    expect(NISAB_GRAMS.tola).toEqual({ gold: 87.48, silver: 612.36 });
    // 20 mithqal at 4.25 g; 200 dirhams at 2.975 g; 7.5 and 52.5 tola at 11.664 g
    expect(20 * 4.25).toBe(85);
    expect(roundMoney(200 * 2.975)).toBe(595);
    expect(roundMoney(7.5 * 11.664)).toBe(87.48);
    expect(roundMoney(52.5 * 11.664)).toBe(612.36);
  });
});

describe('calculateZakat', () => {
  it('nothing entered gives nothing, on both bases', () => {
    const r = calculateZakat(base());
    expect(r.gold.status).toBe('nothing');
    expect(r.silver.status).toBe('nothing');
    expect(r.net).toBe(0);
  });

  it('below nisab: no zakat on that basis', () => {
    const r = calculateZakat(base({ amounts: { cash: 500 } }));
    expect(r.silver).toMatchObject({ status: 'below-nisab', due: 0, nisab: 595 });
    expect(r.gold).toMatchObject({ status: 'below-nisab', due: 0 });
  });

  it('exactly at nisab is due', () => {
    const r = calculateZakat(base({ amounts: { cash: 595 } }));
    expect(r.silver).toMatchObject({ status: 'at-or-above-nisab', due: 14.88 });
  });

  it('basis switch: the same wealth can be above silver and below gold', () => {
    const r = calculateZakat(base({ amounts: { cash: 2000 } }));
    expect(r.silver).toMatchObject({ status: 'at-or-above-nisab', due: 50 });
    expect(r.gold).toMatchObject({ status: 'below-nisab', due: 0 });
    const tola = calculateZakat(base({ amounts: { cash: 600 }, reckoning: 'tola' }));
    expect(tola.silver.status).toBe('below-nisab'); // 600 < 612.36
    expect(calculateZakat(base({ amounts: { cash: 600 } })).silver.status).toBe('at-or-above-nisab'); // 600 ≥ 595
  });

  it('a basis without its price is incomplete, the other still works', () => {
    const r = calculateZakat(base({ amounts: { cash: 2000 }, prices: { gold: null, silver: 1 } }));
    expect(r.gold).toMatchObject({ status: 'incomplete', nisab: null });
    expect(r.silver.status).toBe('at-or-above-nisab');
  });

  it('adds every asset line at 2.5%', () => {
    const r = calculateZakat(
      base({ amounts: { cash: 1000, goldGrams: 10, silverGrams: 100, tradeGoods: 500, receivables: 250 } }),
    );
    expect(r.lines).toEqual({ cash: 1000, gold: 1000, silver: 100, tradeGoods: 500, receivables: 250 });
    expect(r.assets).toBe(2850);
    expect(r.silver.due).toBe(roundMoney(2850 * ZAKAT_RATE));
    expect(r.silver.due).toBe(71.25);
  });

  it('holding metal needs its price', () => {
    const r = calculateZakat(base({ amounts: { goldGrams: 100 }, prices: { gold: null, silver: 1 } }));
    expect(r.missing).toContain('gold-price');
    expect(r.silver.status).toBe('incomplete');
  });

  describe('debt deduction', () => {
    it('asks first when debts are entered', () => {
      const r = calculateZakat(base({ amounts: { cash: 2000, debts: 1500 } }));
      expect(r.missing).toEqual(['debt-choice']);
      expect(r.silver.status).toBe('incomplete');
    });

    it('deduct: debts come off before nisab, and can take wealth below it', () => {
      const r = calculateZakat(base({ amounts: { cash: 2000, debts: 1500 }, debts: 'deduct' }));
      expect(r.deducted).toBe(1500);
      expect(r.net).toBe(500);
      expect(r.silver).toMatchObject({ status: 'below-nisab', due: 0 });
    });

    it('keep: zakat on the wealth held', () => {
      const r = calculateZakat(base({ amounts: { cash: 2000, debts: 1500 }, debts: 'keep' }));
      expect(r.deducted).toBe(0);
      expect(r.silver.due).toBe(50);
    });

    it('never deducts more than the assets', () => {
      const r = calculateZakat(base({ amounts: { cash: 100, debts: 5000 }, debts: 'deduct' }));
      expect(r.deducted).toBe(100);
      expect(r.net).toBe(0);
    });

    it('debts alone are not "something entered"', () => {
      expect(calculateZakat(base({ amounts: { debts: 100 }, debts: 'deduct' })).silver.status).toBe('nothing');
    });
  });

  describe('worn jewellery', () => {
    const amounts = { cash: 300, goldWornGrams: 10, silverWornGrams: 100 };

    it('asks first when worn jewellery is entered', () => {
      const r = calculateZakat(base({ amounts }));
      expect(r.missing).toContain('worn-choice');
      expect(r.silver.status).toBe('incomplete');
    });

    it('include counts it; exclude leaves it out', () => {
      const inc = calculateZakat(base({ amounts, wornJewellery: 'include' }));
      expect(inc.lines.gold).toBe(1000);
      expect(inc.lines.silver).toBe(100);
      expect(inc.silver).toMatchObject({ status: 'at-or-above-nisab', due: 35 });
      const exc = calculateZakat(base({ amounts, wornJewellery: 'exclude' }));
      expect(exc.lines.gold).toBe(0);
      expect(exc.lines.silver).toBe(0);
      expect(exc.silver).toMatchObject({ status: 'below-nisab', due: 0 });
    });

    it('excluded jewellery needs no price', () => {
      const r = calculateZakat(base({ amounts, wornJewellery: 'exclude', prices: { gold: null, silver: 1 } }));
      expect(r.missing).toEqual([]);
    });

    it('kept gold always counts, whatever the choice', () => {
      const r = calculateZakat(base({ amounts: { goldGrams: 10, goldWornGrams: 5 }, wornJewellery: 'exclude' }));
      expect(r.lines.gold).toBe(1000);
    });
  });

  describe('rounding', () => {
    it('rounds money to the cent, half away from zero, without float drift', () => {
      expect(roundMoney(1.005)).toBe(1.01);
      expect(roundMoney(0.125)).toBe(0.13);
      expect(roundMoney(2.675)).toBe(2.68);
      expect(roundMoney(-1.005)).toBe(-1.01);
      expect(roundMoney(NaN)).toBe(0);
    });

    it('rounds the due amount and the metal values', () => {
      const r = calculateZakat(base({ amounts: { cash: 1000.1, silverGrams: 3.333 }, prices: { gold: 100, silver: 0.777 } }));
      expect(r.lines.silver).toBe(2.59); // 2.589741
      expect(r.silver.due).toBe(roundMoney((1000.1 + 2.59) * 0.025)); // 25.06725 → 25.07
      expect(r.silver.due).toBe(25.07);
    });

    it('ignores negative and non-finite amounts', () => {
      const r = calculateZakat(base({ amounts: { cash: -50, tradeGoods: Infinity, receivables: NaN } }));
      expect(r.assets).toBe(0);
      expect(r.silver.status).toBe('nothing');
    });
  });
});

describe('inputFromStore', () => {
  it('reads field ids and option ids, with unchosen options as null', () => {
    const i = inputFromStore({
      inputs: { cash: 10, unknown: 5 },
      options: { reckoning: 'tola', 'worn-jewellery': 'exclude' },
      pricePerGram: { gold: 1, silver: null },
    });
    expect(i.amounts).toEqual({ cash: 10 });
    expect(i.reckoning).toBe('tola');
    expect(i.wornJewellery).toBe('exclude');
    expect(i.debts).toBeNull();
    expect(inputFromStore({ inputs: {}, options: { debts: 'bogus' }, pricePerGram: { gold: null, silver: null } }).reckoning).toBe('dinar');
  });
});
