/** Every error code in spec §13.1, plus INTERNAL_ERROR for network/5xx failures. */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'SESSION_EXPIRED',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'RESET_FAILED',
  'IDENTIFIER_TAKEN',
  'INVALID_CURRENT_PASSWORD',
  'RATE_LIMITED',
  'PRODUCT_INACTIVE',
  'OUT_OF_STOCK',
  'QTY_LIMIT',
  'LIMIT_REACHED',
  'COUPON_INVALID',
  'COUPON_EXPIRED',
  'COUPON_NOT_ELIGIBLE',
  'ADDRESS_NOT_SERVICEABLE',
  'COD_NOT_ALLOWED',
  'GIFT_CARD_INVALID',
  'GIFT_CARD_ALREADY_REDEEMED',
  'GIFT_CARD_INACTIVE',
  'GIFT_CARD_UNUSABLE',
  'NOT_TEST_CARD',
  'CARD_EXPIRED',
  'QUOTE_CHANGED',
  'PENDING_ORDER_EXISTS',
  'CHECKOUT_BLOCKED',
  'ORDER_NOT_PAYABLE',
  'PAYMENT_IN_PROGRESS',
  'PAYMENT_FAILED',
  'PAYMENT_CANCELLED',
  'PAYMENT_TIMED_OUT',
  'ACTION_NOT_ALLOWED',
  'OTP_INCORRECT',
  'OTP_LOCKED',
  'INVOICE_NOT_AVAILABLE',
  'REVIEW_NOT_ELIGIBLE',
  'REVIEW_EXISTS',
  'REVIEW_BLOCKED_CONTENT',
  'ALREADY_REPORTED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface FieldError {
  field: string;
  code: string;
  message: string;
}

/** Error envelope returned by every API error (API-002). `message` is always customer-safe text from §13. */
export interface ErrorEnvelope {
  code: ErrorCode;
  message: string;
  fieldErrors?: FieldError[];
  changes?: QuoteChange[];
  retryAfterSeconds?: number;
  details?: Record<string, unknown>;
}

import type { QuoteChange } from './quote.js';
