import type { Paise } from '../money.js';

/** One priced line given to the quote engine. `nodeIds` must include every ancestor node. */
export interface QuoteLineInput {
  variantId: string;
  productId: string;
  name: string;
  qty: number;
  unitMrp: Paise;
  unitPrice: Paise;
  nodeIds: readonly string[];
  bankOfferEligible: boolean;
  taxRatePercent: number;
}

export interface CouponDefinition {
  code: string;
  type: 'percent' | 'flat';
  /** Percent (integer) for `percent`, paise for `flat`. */
  value: number;
  maxDiscount: Paise | null;
  minEligibleValue: Paise;
  /** Empty = all products. */
  eligibleNodeIds: readonly string[];
  validFrom: Date;
  validTo: Date;
  perCustomerLimit: number;
  active: boolean;
}

export interface BankOfferDefinition {
  id: string;
  bankName: string;
  cardTypes: readonly CardType[];
  percent: number;
  maxDiscount: Paise;
  minEligibleValue: Paise;
  validFrom: Date;
  validTo: Date;
  active: boolean;
}

export type CardType = 'credit' | 'debit';

export interface DeliveryConfig {
  /** Delivery is free when (bag value − coupon) is strictly greater than this (PRC-005). */
  freeThreshold: Paise;
  flatCharge: Paise;
  codMaxPayable: Paise;
  deliveryTaxRatePercent: number;
}

export interface PaymentSelectionInput {
  giftCard?: { id: string; balance: Paise; usable: boolean } | null;
  useCredits?: boolean;
  creditBalance?: Paise;
  method?: 'card' | 'upi' | 'cod' | null;
  card?: { issuingBank: string; cardType: CardType } | null;
}

export interface QuoteInput {
  lines: readonly QuoteLineInput[];
  /** `customerUses` is null for guests: the per-customer limit is checked after login (SD-03). */
  coupon?: { definition: CouponDefinition; customerUses: number | null } | null;
  bankOffer?: BankOfferDefinition | null;
  delivery: DeliveryConfig;
  payment?: PaymentSelectionInput | null;
  now: Date;
}

export type CouponStatus =
  | { state: 'none' }
  | { state: 'applied'; code: string; discount: Paise }
  | {
      state: 'rejected';
      code: string;
      reason: 'inactive' | 'expired' | 'min_value' | 'no_eligible_items' | 'limit_reached';
      shortfall?: Paise;
    };

export type BankOfferStatus =
  | { state: 'none' }
  | { state: 'applied'; discount: Paise }
  /** Eligible, but the remainder isn't being paid with a qualifying HDFC card. `potentialDiscount` drives BAG-008. */
  | { state: 'available'; potentialDiscount: Paise; minEligibleValue: Paise }
  | { state: 'not_eligible'; reason: 'inactive' | 'no_eligible_items' | 'min_value' | 'wallet_covers_total'; minEligibleValue: Paise };

export interface QuoteLine {
  variantId: string;
  productId: string;
  name: string;
  qty: number;
  unitMrp: Paise;
  unitPrice: Paise;
  lineMrp: Paise;
  lineValue: Paise;
  couponShare: Paise;
  bankOfferShare: Paise;
  lineNet: Paise;
  taxRatePercent: number;
  taxPortion: Paise;
}

export interface Quote {
  lines: QuoteLine[];
  totalMrp: Paise;
  discountOnMrp: Paise;
  bagValue: Paise;
  coupon: CouponStatus;
  couponDiscount: Paise;
  deliveryCharge: Paise;
  /** Amount to add for free delivery, rounded up to a whole rupee; 0 when delivery is already free. */
  freeDeliveryShortfall: Paise;
  bankOffer: BankOfferStatus;
  bankOfferDiscount: Paise;
  total: Paise;
  taxPortion: Paise;
  wallet: { giftCardId: string | null; giftCard: Paise; credits: Paise };
  remainder: Paise;
  allowedMethods: ('card' | 'upi' | 'cod')[];
  /** Set when the selected method isn't allowed for this remainder (PRC-011). */
  methodError: 'COD_NOT_ALLOWED' | 'METHOD_NOT_NEEDED' | null;
}
