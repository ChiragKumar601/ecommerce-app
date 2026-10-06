import type { GiftCardStatus, PaymentOutcome, RefundStatus } from '@app/shared';
import { defineMachine } from './machine.js';

/** Payment attempt (spec §7.4): PENDING → one final outcome. A retry is a new attempt record. */
export const paymentAttemptMachine = defineMachine<PaymentOutcome, 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT'>([
  { from: ['pending'], event: 'SUCCEEDED', to: 'success' },
  { from: ['pending'], event: 'FAILED', to: 'failure' },
  { from: ['pending'], event: 'CANCELLED', to: 'cancelled' },
  { from: ['pending'], event: 'TIMED_OUT', to: 'timed_out' },
]);

/** Refund (spec §7.5). */
export const refundMachine = defineMachine<RefundStatus, 'COMPLETE'>([{ from: ['initiated'], event: 'COMPLETE', to: 'refunded' }]);

/** Account gift card (spec §7.6). EXPIRED is final. */
export const giftCardMachine = defineMachine<GiftCardStatus, 'BALANCE_EXHAUSTED' | 'CREDITED' | 'EXPIRED'>([
  { from: ['active'], event: 'BALANCE_EXHAUSTED', to: 'exhausted' },
  { from: ['exhausted'], event: 'CREDITED', to: 'active' },
  { from: ['active', 'exhausted'], event: 'EXPIRED', to: 'expired' },
]);

/** Review (spec §7.7). */
export type ReviewState = 'visible' | 'hidden' | 'deleted';
export const reviewMachine = defineMachine<ReviewState, 'THIRD_REPORT' | 'AUTHOR_DELETED'>([
  { from: ['visible'], event: 'THIRD_REPORT', to: 'hidden' },
  { from: ['visible', 'hidden'], event: 'AUTHOR_DELETED', to: 'deleted' },
]);
