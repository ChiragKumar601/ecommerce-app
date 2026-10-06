import type { Paise } from '../money.js';

/** Discount % = floor((mrp − sellingPrice) / mrp × 100) (SD-05). 0 when there's no discount. */
export function discountPercent(mrp: Paise, sellingPrice: Paise): number {
  if (mrp <= 0 || sellingPrice >= mrp) return 0;
  return Math.floor(((mrp - sellingPrice) * 100) / mrp);
}
