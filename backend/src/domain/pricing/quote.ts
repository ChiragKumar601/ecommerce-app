import { includedTax, largestRemainder, percentToRupee, type Paise } from '../money.js';
import type {
  BankOfferStatus,
  CouponStatus,
  Quote,
  QuoteInput,
  QuoteLine,
  QuoteLineInput,
} from './types.js';

const inWindow = (now: Date, from: Date, to: Date) => now.getTime() >= from.getTime() && now.getTime() <= to.getTime();

function couponLineEligible(line: QuoteLineInput, eligibleNodeIds: readonly string[]): boolean {
  return eligibleNodeIds.length === 0 || line.nodeIds.some((id) => eligibleNodeIds.includes(id));
}

/** PRC-002 / PRC-003 / PRC-004: coupon eligibility, discount and per-line shares. */
function evaluateCoupon(input: QuoteInput, lineValues: Paise[]): { status: CouponStatus; shares: Paise[] } {
  const zero = input.lines.map(() => 0);
  if (!input.coupon) return { status: { state: 'none' }, shares: zero };
  const { definition: c, customerUses } = input.coupon;
  const reject = (reason: Extract<CouponStatus, { state: 'rejected' }>['reason'], shortfall?: Paise) => ({
    status: { state: 'rejected', code: c.code, reason, ...(shortfall !== undefined ? { shortfall } : {}) } as CouponStatus,
    shares: zero,
  });
  if (!c.active) return reject('inactive');
  if (!inWindow(input.now, c.validFrom, c.validTo)) return reject('expired');
  const eligible = input.lines.map((l) => couponLineEligible(l, c.eligibleNodeIds));
  const weights = lineValues.map((v, i) => (eligible[i] ? v : 0));
  const base = weights.reduce((a, b) => a + b, 0);
  if (base === 0) return reject('no_eligible_items');
  if (base < c.minEligibleValue) return reject('min_value', c.minEligibleValue - base);
  if (customerUses !== null && customerUses >= c.perCustomerLimit) return reject('limit_reached');
  const raw = c.type === 'percent' ? percentToRupee(base, c.value) : c.value;
  const capped = c.type === 'percent' && c.maxDiscount !== null ? Math.min(raw, c.maxDiscount) : raw;
  const discount = Math.min(capped, base);
  return { status: { state: 'applied', code: c.code, discount }, shares: largestRemainder(discount, weights) };
}

interface BankOfferEval {
  /** Discount if a qualifying card pays; 0 if the offer can't apply to these items. */
  potential: Paise;
  shares: Paise[];
  notEligible?: Extract<BankOfferStatus, { state: 'not_eligible' }>['reason'];
}

/** PRC-006: bank-offer base and discount on eligible lines after their coupon share. */
function evaluateBankOffer(input: QuoteInput, lineValues: Paise[], couponShares: Paise[]): BankOfferEval {
  const zero = input.lines.map(() => 0);
  const o = input.bankOffer;
  if (!o) return { potential: 0, shares: zero };
  if (!o.active || !inWindow(input.now, o.validFrom, o.validTo)) return { potential: 0, shares: zero, notEligible: 'inactive' };
  const weights = input.lines.map((l, i) => (l.bankOfferEligible ? lineValues[i]! : 0));
  const base = input.lines.reduce((s, l, i) => (l.bankOfferEligible ? s + lineValues[i]! - couponShares[i]! : s), 0);
  if (weights.every((w) => w === 0)) return { potential: 0, shares: zero, notEligible: 'no_eligible_items' };
  if (base < o.minEligibleValue) return { potential: 0, shares: zero, notEligible: 'min_value' };
  const discount = Math.min(percentToRupee(base, o.percent), o.maxDiscount);
  return { potential: discount, shares: largestRemainder(discount, weights) };
}

function cardQualifies(input: QuoteInput): boolean {
  const p = input.payment;
  const o = input.bankOffer;
  return !!(p?.method === 'card' && p.card && o && p.card.issuingBank === o.bankName && o.cardTypes.includes(p.card.cardType));
}

function applyWallet(input: QuoteInput, total: Paise) {
  const gc = input.payment?.giftCard;
  const giftCard = gc && gc.usable ? Math.min(gc.balance, total) : 0;
  const credits = input.payment?.useCredits ? Math.min(input.payment.creditBalance ?? 0, total - giftCard) : 0;
  return { giftCardId: giftCard > 0 && gc ? gc.id : null, giftCard, credits, remainder: total - giftCard - credits };
}

/**
 * The pricing engine (spec §6.13, PRC-001…012). Pure: every amount the customer sees comes from here.
 * Order: line values → coupon → shares → delivery → bank offer → total → wallet → offer withdrawal
 * when the wallet covers the total (PRC-009) → tax portion → COD rule.
 */
export function computeQuote(input: QuoteInput): Quote {
  // PRC-001
  const lineValues = input.lines.map((l) => l.unitPrice * l.qty);
  const lineMrps = input.lines.map((l) => l.unitMrp * l.qty);
  const bagValue = lineValues.reduce((a, b) => a + b, 0);
  const totalMrp = lineMrps.reduce((a, b) => a + b, 0);

  // PRC-002…004
  const coupon = evaluateCoupon(input, lineValues);
  const couponDiscount = coupon.status.state === 'applied' ? coupon.status.discount : 0;

  // PRC-005
  const afterCoupon = bagValue - couponDiscount;
  const free = afterCoupon > input.delivery.freeThreshold;
  const deliveryCharge = bagValue === 0 || free ? 0 : input.delivery.flatCharge;
  const freeDeliveryShortfall =
    bagValue === 0 || free ? 0 : Math.ceil((input.delivery.freeThreshold - afterCoupon + 1) / 100) * 100;

  // PRC-006…009
  const bank = evaluateBankOffer(input, lineValues, coupon.shares);
  const withoutOffer = bagValue - couponDiscount + deliveryCharge;
  let bankOfferDiscount = 0;
  let bankShares = input.lines.map(() => 0);
  let bankOffer: BankOfferStatus = { state: 'none' };
  const minEligibleValue = input.bankOffer?.minEligibleValue ?? 0;

  if (bank.notEligible) {
    bankOffer = { state: 'not_eligible', reason: bank.notEligible, minEligibleValue };
  } else if (bank.potential > 0 && cardQualifies(input)) {
    const walletWithOffer = applyWallet(input, withoutOffer - bank.potential);
    if (walletWithOffer.remainder > 0) {
      bankOfferDiscount = bank.potential;
      bankShares = bank.shares;
      bankOffer = { state: 'applied', discount: bank.potential };
    } else {
      // PRC-009: the wallet covers everything, so no card pays and the offer can't apply.
      bankOffer = { state: 'not_eligible', reason: 'wallet_covers_total', minEligibleValue };
    }
  } else if (bank.potential > 0) {
    bankOffer = { state: 'available', potentialDiscount: bank.potential, minEligibleValue };
  }

  // PRC-007
  const total = withoutOffer - bankOfferDiscount;

  // PRC-008
  const wallet = applyWallet(input, total);

  // PRC-010
  const lines: QuoteLine[] = input.lines.map((l, i) => {
    const lineNet = lineValues[i]! - coupon.shares[i]! - bankShares[i]!;
    return {
      variantId: l.variantId,
      productId: l.productId,
      name: l.name,
      qty: l.qty,
      unitMrp: l.unitMrp,
      unitPrice: l.unitPrice,
      lineMrp: lineMrps[i]!,
      lineValue: lineValues[i]!,
      couponShare: coupon.shares[i]!,
      bankOfferShare: bankShares[i]!,
      lineNet,
      taxRatePercent: l.taxRatePercent,
      taxPortion: includedTax(lineNet, l.taxRatePercent),
    };
  });
  const taxPortion =
    lines.reduce((s, l) => s + l.taxPortion, 0) + includedTax(deliveryCharge, input.delivery.deliveryTaxRatePercent);

  // PRC-011
  const allowedMethods: Quote['allowedMethods'] =
    wallet.remainder === 0 ? [] : wallet.remainder <= input.delivery.codMaxPayable ? ['card', 'upi', 'cod'] : ['card', 'upi'];
  const method = input.payment?.method ?? null;
  const methodError: Quote['methodError'] =
    method && wallet.remainder === 0 ? 'METHOD_NOT_NEEDED' : method === 'cod' && !allowedMethods.includes('cod') ? 'COD_NOT_ALLOWED' : null;

  return {
    lines,
    totalMrp,
    discountOnMrp: totalMrp - bagValue,
    bagValue,
    coupon: coupon.status,
    couponDiscount,
    deliveryCharge,
    freeDeliveryShortfall,
    bankOffer,
    bankOfferDiscount,
    total,
    taxPortion,
    wallet: { giftCardId: wallet.giftCardId, giftCard: wallet.giftCard, credits: wallet.credits },
    remainder: wallet.remainder,
    allowedMethods,
    methodError,
  };
}
