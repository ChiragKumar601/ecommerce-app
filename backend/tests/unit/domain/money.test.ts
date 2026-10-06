import { describe, expect, it } from 'vitest';
import {
  divRoundHalfUp,
  formatINR,
  includedTax,
  largestRemainder,
  money,
  percentToRupee,
  roundToRupee,
  rupees,
} from '../../../src/domain/money.js';

describe('money (spec §0, SD-01, SD-43)', () => {
  it('formats ₹ with Indian grouping, showing paise only when non-zero', () => {
    expect(formatINR(12345600)).toBe('₹1,23,456');
    expect(formatINR(85011)).toBe('₹850.11');
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(99900)).toBe('₹999');
    expect(formatINR(100000)).toBe('₹1,000');
    expect(formatINR(1234567890)).toBe('₹1,23,45,678.90');
    expect(formatINR(-30000)).toBe('−₹300');
  });
  it('builds API money values', () => {
    expect(money(476200)).toEqual({ paise: 476200, display: '₹4,762' });
    expect(() => money(1.5)).toThrow(RangeError);
  });
  it('rounds half up', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(4, 2)).toBe(2);
    expect(roundToRupee(55160)).toBe(55200);
    expect(roundToRupee(55149)).toBe(55100);
    expect(roundToRupee(55150)).toBe(55200);
    expect(rupees(1999)).toBe(199900);
  });
  it('computes percentages rounded to the rupee (WX-1 coupon and bank offer)', () => {
    expect(percentToRupee(551600, 10)).toBe(55200); // ₹551.60 → ₹552 (then capped at ₹300 by PRC-003)
    expect(percentToRupee(453610, 10)).toBe(45400); // ₹453.61 → ₹454
  });
  it('splits by largest remainder, summing exactly (WX-1 shares)', () => {
    expect(largestRemainder(30000, [199800, 279900, 71900])).toEqual([10867, 15223, 3910]);
    expect(largestRemainder(45400, [199800, 279900])).toEqual([18910, 26490]);
    expect(largestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]); // ties go to the earliest line
    expect(largestRemainder(0, [5, 5])).toEqual([0, 0]);
    expect(largestRemainder(100, [])).toEqual([]);
    for (let total = 0; total < 500; total += 37) {
      const parts = largestRemainder(total, [3, 7, 11, 13]);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
  it('computes included tax half up to paise (WX-1 tax portions)', () => {
    expect(includedTax(170023, 5)).toBe(8096);
    expect(includedTax(238187, 5)).toBe(11342);
    expect(includedTax(67990, 18)).toBe(10371);
  });
});
