import type { OrderStatus } from '@app/shared';
import { defineMachine } from './machine.js';

/** Order events (spec §7.1). */
export type OrderEvent =
  | 'PAYMENT_SUCCEEDED' // attempt success, or Pay with r = 0 / COD (actor: system or customer)
  | 'PAYMENT_WINDOW_EXPIRED'
  | 'CUSTOMER_CANCELLED_PENDING'
  | 'TIMER'
  | 'ALL_LINES_CANCELLED'
  | 'OTP_CONFIRMED'
  | 'PARCEL_REJECTED'
  | 'HANDOVER_EXPIRED';

/** `deliveryAttempt` is the current attempt (1 or 2) while OUT_FOR_DELIVERY. */
export interface OrderContext {
  deliveryAttempt: number;
}

const attempt = (n: number) => (c: OrderContext) => c?.deliveryAttempt === n;

export const orderMachine = defineMachine<OrderStatus, OrderEvent, OrderContext>([
  { from: ['AWAITING_PAYMENT'], event: 'PAYMENT_SUCCEEDED', to: 'PLACED' },
  { from: ['AWAITING_PAYMENT'], event: 'PAYMENT_WINDOW_EXPIRED', to: 'FAILED' },
  { from: ['AWAITING_PAYMENT'], event: 'CUSTOMER_CANCELLED_PENDING', to: 'CANCELLED' },
  { from: ['PLACED'], event: 'TIMER', to: 'CONFIRMED' },
  { from: ['CONFIRMED'], event: 'TIMER', to: 'PACKED' },
  { from: ['PACKED'], event: 'TIMER', to: 'SHIPPED' },
  { from: ['SHIPPED'], event: 'TIMER', to: 'OUT_FOR_DELIVERY' },
  { from: ['DELIVERY_ATTEMPT_FAILED'], event: 'TIMER', to: 'OUT_FOR_DELIVERY' },
  { from: ['PLACED', 'CONFIRMED', 'PACKED'], event: 'ALL_LINES_CANCELLED', to: 'CANCELLED' },
  { from: ['OUT_FOR_DELIVERY'], event: 'OTP_CONFIRMED', to: 'DELIVERED' },
  { from: ['OUT_FOR_DELIVERY'], event: 'PARCEL_REJECTED', to: 'REJECTED_AT_DELIVERY' },
  { from: ['OUT_FOR_DELIVERY'], event: 'HANDOVER_EXPIRED', to: 'DELIVERY_ATTEMPT_FAILED', guard: attempt(1) },
  { from: ['OUT_FOR_DELIVERY'], event: 'HANDOVER_EXPIRED', to: 'RETURNED_TO_ORIGIN', guard: attempt(2) },
]);

export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'DELIVERED',
  'FAILED',
  'CANCELLED',
  'REJECTED_AT_DELIVERY',
  'RETURNED_TO_ORIGIN',
];

/** Statuses in which a line may be cancelled (CNL-001, R-14). */
export const LINE_CANCELLABLE_STATUSES: readonly OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED'];

export const isTerminalOrderStatus = (s: OrderStatus) => TERMINAL_ORDER_STATUSES.includes(s);
