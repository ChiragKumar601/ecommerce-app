import type { BankOfferDefinition, CouponDefinition, DeliveryConfig, QuoteInput, QuoteLineInput } from '../../../src/domain/pricing/types.js';

// Spec §5 seed configuration and the spec §15 worked-example cart.
export const NOW = new Date('2026-10-06T06:30:00Z');

export const DELIVERY: DeliveryConfig = {
  freeThreshold: 199900,
  flatCharge: 9900,
  codMaxPayable: 1000000,
  deliveryTaxRatePercent: 18,
};

export const HDFC: BankOfferDefinition = {
  id: 'hdfc',
  bankName: 'HDFC Bank',
  cardTypes: ['credit', 'debit'],
  percent: 10,
  maxDiscount: 100000,
  minEligibleValue: 250000,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: new Date('2027-12-31T23:59:59Z'),
  active: true,
};

export const WELCOME10: CouponDefinition = {
  code: 'WELCOME10',
  type: 'percent',
  value: 10,
  maxDiscount: 30000,
  minEligibleValue: 99900,
  eligibleNodeIds: [],
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: new Date('2027-12-31T23:59:59Z'),
  perCustomerLimit: 1,
  active: true,
};

export const LINE_A: QuoteLineInput = {
  variantId: 'A', productId: 'pA', name: 'T-shirt', qty: 2, unitMrp: 149900, unitPrice: 99900,
  nodeIds: ['men', 'men-topwear', 'men-topwear-tshirts'], bankOfferEligible: true, taxRatePercent: 5,
};
export const LINE_B: QuoteLineInput = {
  variantId: 'B', productId: 'pB', name: 'Sneakers', qty: 1, unitMrp: 399900, unitPrice: 279900,
  nodeIds: ['men', 'men-footwear', 'men-footwear-sneakers'], bankOfferEligible: true, taxRatePercent: 5,
};
export const LINE_C: QuoteLineInput = {
  variantId: 'C', productId: 'pC', name: 'Face serum', qty: 1, unitMrp: 89900, unitPrice: 71900,
  nodeIds: ['beauty', 'beauty-skincare', 'beauty-skincare-serum'], bankOfferEligible: false, taxRatePercent: 18,
};

/** WX-1: WELCOME10, HDFC credit card, credits on with a ₹500 balance. */
export function wx1Input(overrides: Partial<QuoteInput> = {}): QuoteInput {
  return {
    lines: [LINE_A, LINE_B, LINE_C],
    coupon: { definition: WELCOME10, customerUses: 0 },
    bankOffer: HDFC,
    delivery: DELIVERY,
    payment: {
      method: 'card',
      card: { issuingBank: 'HDFC Bank', cardType: 'credit' },
      useCredits: true,
      creditBalance: 50000,
      giftCard: null,
    },
    now: NOW,
    ...overrides,
  };
}
