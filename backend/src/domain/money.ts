import type { Money } from '@app/shared';

/** Money is always an integer number of paise (spec §0). */
export type Paise = number;

export function assertPaise(value: number): Paise {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not an integer paise amount: ${value}`);
  return value;
}

export const rupees = (r: number): Paise => assertPaise(Math.round(r * 100));

/** Rounds `num / den` half up to the nearest integer, for non-negative integers. */
export function divRoundHalfUp(num: number, den: number): number {
  if (num < 0 || den <= 0) throw new RangeError('divRoundHalfUp expects num ≥ 0 and den > 0');
  return Math.floor((2 * num + den) / (2 * den));
}

/** Rounds paise half up to the nearest whole rupee (PRC-003). */
export function roundToRupee(paise: Paise): Paise {
  return divRoundHalfUp(paise, 100) * 100;
}

/** `percent`% of `base`, rounded half up to the nearest whole rupee (PRC-003, PRC-006). */
export function percentToRupee(base: Paise, percent: number): Paise {
  if (!Number.isInteger(percent) || percent < 0) throw new RangeError('percent must be a non-negative integer');
  return divRoundHalfUp(base * percent, 10_000) * 100;
}

/** Tax portion included in a tax-inclusive amount: amount × rate / (100 + rate), half up to paise (PRC-010). */
export function includedTax(amount: Paise, ratePercent: number): Paise {
  return divRoundHalfUp(amount * ratePercent, 100 + ratePercent);
}

/**
 * Splits `total` across `weights` proportionally with the largest-remainder method (PRC-004).
 * The parts always sum exactly to `total`; ties go to the earliest index.
 */
export function largestRemainder(total: Paise, weights: readonly number[]): Paise[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const floors: number[] = [];
  const remainders: { i: number; r: number }[] = [];
  let allocated = 0;
  weights.forEach((w, i) => {
    const exact = total * w; // compare remainders as integers: exact mod sum
    const f = Math.floor(exact / sum);
    floors.push(f);
    allocated += f;
    remainders.push({ i, r: exact - f * sum });
  });
  remainders.sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; k < total - allocated; k += 1) {
    const target = remainders[k];
    if (target) floors[target.i] = (floors[target.i] ?? 0) + 1;
  }
  return floors;
}

function groupIndian(intPart: string): string {
  if (intPart.length <= 3) return intPart;
  const last3 = intPart.slice(-3);
  const rest = intPart.slice(0, -3);
  return `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}`;
}

/** Formats paise as ₹ with Indian digit grouping; paise shown only when non-zero (SD-01, FE-008). */
export function formatINR(paise: Paise): string {
  assertPaise(paise);
  const sign = paise < 0 ? '−' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const fraction = abs % 100;
  const text = groupIndian(String(whole)) + (fraction ? `.${String(fraction).padStart(2, '0')}` : '');
  return `${sign}₹${text}`;
}

/** API representation of an amount (API-005). */
export function money(paise: Paise): Money {
  return { paise: assertPaise(paise), display: formatINR(paise) };
}
