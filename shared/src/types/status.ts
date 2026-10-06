// Status and method unions shared by API responses (spec §4 and §7).

export const ORDER_STATUSES = [
  'AWAITING_PAYMENT',
  'PLACED',
  'CONFIRMED',
  'PACKED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_ATTEMPT_FAILED',
  'FAILED',
  'CANCELLED',
  'REJECTED_AT_DELIVERY',
  'RETURNED_TO_ORIGIN',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderLineState = 'active' | 'cancelled';

export const RETURN_STATUSES = [
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'PICKUP_SCHEDULED',
  'PICKUP_FAILED',
  'PICKED_UP',
  'RETURN_CLOSED',
  'REFUND_INITIATED',
  'REFUNDED',
] as const;
export type ReturnStatus = (typeof RETURN_STATUSES)[number];

export type PaymentOutcome = 'pending' | 'success' | 'failure' | 'cancelled' | 'timed_out';
export type RemainderMethod = 'card' | 'upi' | 'cod';
export type PaymentMethod = RemainderMethod | 'none';
export type AllocationSource = 'card' | 'upi' | 'cod' | 'gift_card' | 'credits';
export type RefundStatus = 'initiated' | 'refunded';
export type RefundTrigger = 'cancellation' | 'return' | 'rejected_at_delivery' | 'returned_to_origin';
export type GiftCardStatus = 'active' | 'exhausted' | 'expired';
export type ReviewStatus = 'visible' | 'hidden';
export type SupportRequestType =
  | 'order_issue'
  | 'payment'
  | 'return_refund'
  | 'account'
  | 'account_deletion'
  | 'other';
