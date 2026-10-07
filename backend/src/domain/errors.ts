import type { ErrorCode, ErrorEnvelope, FieldError, QuoteChange } from '@app/shared';

/** Details a service can attach to an error; used to build the customer message and envelope. */
export interface ErrorDetails {
  fieldErrors?: FieldError[];
  changes?: QuoteChange[];
  retryAfterSeconds?: number;
  /** Values interpolated into messages, e.g. minutes, item, available, pincode, shortfall. */
  [key: string]: unknown;
}

type MessageFn = (d: ErrorDetails) => string;

const str = (v: unknown, fallback = ''): string => (v === undefined || v === null ? fallback : String(v));

/** Spec §13.1: error code → HTTP status and customer message. Messages are customer-safe (GLB-003). */
export const ERROR_CATALOGUE: Record<ErrorCode, { status: number; message: string | MessageFn }> = {
  VALIDATION_ERROR: { status: 422, message: 'Please check the highlighted fields.' },
  NOT_FOUND: { status: 404, message: "We couldn't find that." },
  SESSION_EXPIRED: { status: 401, message: 'Your session has expired. Please log in again.' },
  UNAUTHENTICATED: { status: 401, message: 'Please log in to continue.' },
  INVALID_CREDENTIALS: { status: 401, message: 'Incorrect email/phone or password.' },
  ACCOUNT_LOCKED: {
    status: 423,
    message: (d) => `Too many attempts. Try again in ${str(d['minutes'], '15')} minutes.`,
  },
  RESET_FAILED: { status: 400, message: "The details you entered don't match our records." },
  IDENTIFIER_TAKEN: {
    status: 409,
    message: (d) =>
      d['context'] === 'profile'
        ? 'This email/phone is already linked to another account.'
        : 'An account with this email/phone already exists.',
  },
  INVALID_CURRENT_PASSWORD: { status: 403, message: 'Your current password is incorrect.' },
  RATE_LIMITED: { status: 429, message: 'Too many requests. Please wait a moment and try again.' },
  PRODUCT_INACTIVE: { status: 409, message: 'This product is no longer available.' },
  OUT_OF_STOCK: {
    status: 409,
    message: (d) =>
      typeof d['available'] === 'number' && d['available'] > 0
        ? `Only ${d['available']} left.`
        : `${str(d['item'], 'This item')} is out of stock.`,
  },
  QTY_LIMIT: { status: 409, message: 'Maximum 10 per item.' },
  LIMIT_REACHED: {
    status: 409,
    message: (d) => {
      switch (d['context']) {
        case 'addresses':
          return 'You can save up to 10 addresses. Delete one to add another.';
        case 'cards':
          return 'You can save up to 5 cards. Remove one to add another.';
        case 'bag':
          return 'Your bag can hold up to 50 different items.';
        default:
          return "You've reached the limit for this.";
      }
    },
  },
  COUPON_INVALID: { status: 422, message: "This coupon code isn't valid." },
  COUPON_EXPIRED: { status: 422, message: 'This coupon has expired.' },
  COUPON_NOT_ELIGIBLE: {
    status: 422,
    message: (d) => {
      switch (d['reason']) {
        case 'min_value':
          return `Add items worth ${str(d['shortfall'])} more to use this coupon`;
        case 'no_eligible_items':
          return "This coupon doesn't apply to items in your bag";
        case 'limit_reached':
          return "You've already used this coupon";
        default:
          return "This coupon can't be used on this order";
      }
    },
  },
  ADDRESS_NOT_SERVICEABLE: {
    status: 422,
    message: (d) => `We don't deliver to ${str(d['pincode'], 'this pincode')} yet.`,
  },
  COD_NOT_ALLOWED: { status: 422, message: 'Cash on Delivery is available for amounts up to ₹10,000.' },
  GIFT_CARD_INVALID: { status: 422, message: 'Invalid gift card code' },
  GIFT_CARD_ALREADY_REDEEMED: { status: 409, message: "You've already redeemed this gift card" },
  GIFT_CARD_INACTIVE: { status: 422, message: 'This gift card is no longer valid' },
  GIFT_CARD_UNUSABLE: { status: 422, message: 'This gift card has expired or has no balance.' },
  NOT_TEST_CARD: { status: 422, message: "Use a demo test card. Real cards aren't accepted. See Demo help." },
  CARD_EXPIRED: { status: 422, message: 'This card has expired.' },
  QUOTE_CHANGED: { status: 409, message: 'Some details changed:' },
  PENDING_ORDER_EXISTS: { status: 409, message: 'You have an order waiting for payment.' },
  CHECKOUT_BLOCKED: { status: 409, message: 'Fix the highlighted items in your bag to continue.' },
  ORDER_NOT_PAYABLE: { status: 409, message: 'This order can no longer be paid.' },
  PAYMENT_IN_PROGRESS: { status: 409, message: 'A payment for this order is already in progress.' },
  PAYMENT_FAILED: { status: 402, message: 'Payment failed. No money was taken.' },
  PAYMENT_CANCELLED: { status: 402, message: 'Payment cancelled.' },
  PAYMENT_TIMED_OUT: { status: 402, message: 'Payment timed out. No money was taken.' },
  ACTION_NOT_ALLOWED: { status: 409, message: "This action isn't available for this order anymore." },
  OTP_INCORRECT: { status: 422, message: 'Incorrect OTP' },
  OTP_LOCKED: { status: 423, message: 'Too many incorrect OTPs. Delivery will be re-attempted.' },
  INVOICE_NOT_AVAILABLE: { status: 409, message: 'The invoice will be available once your order ships.' },
  REVIEW_NOT_ELIGIBLE: { status: 403, message: "You can review this product after it's delivered to you." },
  REVIEW_EXISTS: { status: 409, message: "You've already reviewed this product." },
  REVIEW_BLOCKED_CONTENT: {
    status: 422,
    message: "Your review contains words we don't allow. Please edit and try again.",
  },
  ALREADY_REPORTED: { status: 409, message: "You've already reported this review." },
  INTERNAL_ERROR: { status: 500, message: 'Something went wrong. Please try again.' },
};

export function messageFor(code: ErrorCode, details: ErrorDetails = {}): string {
  const entry = ERROR_CATALOGUE[code];
  return typeof entry.message === 'function' ? entry.message(details) : entry.message;
}

/** The only error type services throw for expected failures. Mapped to the envelope by the API. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails;

  constructor(code: ErrorCode, details: ErrorDetails = {}) {
    super(messageFor(code, details));
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CATALOGUE[code].status;
    this.details = details;
  }

  toEnvelope(): ErrorEnvelope {
    const { fieldErrors, changes, retryAfterSeconds, ...rest } = this.details;
    const envelope: ErrorEnvelope = { code: this.code, message: this.message };
    if (fieldErrors?.length) envelope.fieldErrors = fieldErrors;
    if (changes?.length) envelope.changes = changes;
    if (retryAfterSeconds !== undefined) envelope.retryAfterSeconds = retryAfterSeconds;
    const publicDetails = Object.fromEntries(Object.entries(rest).filter(([k]) => PUBLIC_DETAIL_KEYS.has(k)));
    if (Object.keys(publicDetails).length) envelope.details = publicDetails;
    return envelope;
  }
}

/** Detail keys safe to expose to the client; anything else stays server-side. */
const PUBLIC_DETAIL_KEYS = new Set(['minutes', 'available', 'item', 'pincode', 'reason', 'shortfall', 'context', 'orderId', 'lines', 'pending']);

/** Envelope for unexpected errors: generic text, nothing internal (GLB-003). */
export function internalErrorEnvelope(): ErrorEnvelope {
  return { code: 'INTERNAL_ERROR', message: messageFor('INTERNAL_ERROR') };
}
