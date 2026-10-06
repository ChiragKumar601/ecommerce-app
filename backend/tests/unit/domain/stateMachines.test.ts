import { ORDER_STATUSES, RETURN_STATUSES } from '@app/shared';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/domain/errors.js';
import { giftCardMachine, paymentAttemptMachine, refundMachine, reviewMachine } from '../../../src/domain/state/misc.js';
import { isLocked, lockMinutesLeft, registerFailure, registerSuccess, type LockState } from '../../../src/domain/state/lock.js';
import type { Machine } from '../../../src/domain/state/machine.js';
import { isTerminalOrderStatus, orderMachine, type OrderEvent } from '../../../src/domain/state/order.js';
import { orderLineMachine } from '../../../src/domain/state/orderLine.js';
import { returnMachine, type ReturnEvent } from '../../../src/domain/state/returnRequest.js';

/** Every (state, event) pair: allowed exactly when listed; everything else → ACTION_NOT_ALLOWED. */
function exhaustive<S extends string, E extends string, C>(
  machine: Machine<S, E, C>,
  states: readonly S[],
  events: readonly E[],
  expected: Record<string, S>,
  ctx?: C,
) {
  for (const s of states) {
    for (const e of events) {
      const key = `${s}:${e}`;
      if (key in expected) {
        expect(machine.next(s, e, ctx), key).toBe(expected[key]);
      } else {
        expect(machine.can(s, e, ctx), key).toBe(false);
        expect(() => machine.next(s, e, ctx)).toThrow(AppError);
      }
    }
  }
}

const ORDER_EVENTS: OrderEvent[] = [
  'PAYMENT_SUCCEEDED', 'PAYMENT_WINDOW_EXPIRED', 'CUSTOMER_CANCELLED_PENDING', 'TIMER',
  'ALL_LINES_CANCELLED', 'OTP_CONFIRMED', 'PARCEL_REJECTED', 'HANDOVER_EXPIRED',
];
const ORDER_COMMON = {
  'AWAITING_PAYMENT:PAYMENT_SUCCEEDED': 'PLACED',
  'AWAITING_PAYMENT:PAYMENT_WINDOW_EXPIRED': 'FAILED',
  'AWAITING_PAYMENT:CUSTOMER_CANCELLED_PENDING': 'CANCELLED',
  'PLACED:TIMER': 'CONFIRMED',
  'CONFIRMED:TIMER': 'PACKED',
  'PACKED:TIMER': 'SHIPPED',
  'SHIPPED:TIMER': 'OUT_FOR_DELIVERY',
  'DELIVERY_ATTEMPT_FAILED:TIMER': 'OUT_FOR_DELIVERY',
  'PLACED:ALL_LINES_CANCELLED': 'CANCELLED',
  'CONFIRMED:ALL_LINES_CANCELLED': 'CANCELLED',
  'PACKED:ALL_LINES_CANCELLED': 'CANCELLED',
  'OUT_FOR_DELIVERY:OTP_CONFIRMED': 'DELIVERED',
  'OUT_FOR_DELIVERY:PARCEL_REJECTED': 'REJECTED_AT_DELIVERY',
} as const;

describe('§7.1 order status — exhaustive', () => {
  it('attempt 1: handover expiry → Delivery Attempt Failed', () => {
    exhaustive(orderMachine, ORDER_STATUSES, ORDER_EVENTS, { ...ORDER_COMMON, 'OUT_FOR_DELIVERY:HANDOVER_EXPIRED': 'DELIVERY_ATTEMPT_FAILED' }, { deliveryAttempt: 1 });
  });
  it('attempt 2: handover expiry → Returned to Origin', () => {
    exhaustive(orderMachine, ORDER_STATUSES, ORDER_EVENTS, { ...ORDER_COMMON, 'OUT_FOR_DELIVERY:HANDOVER_EXPIRED': 'RETURNED_TO_ORIGIN' }, { deliveryAttempt: 2 });
  });
  it('knows the terminal statuses', () => {
    expect(ORDER_STATUSES.filter(isTerminalOrderStatus)).toEqual(['DELIVERED', 'FAILED', 'CANCELLED', 'REJECTED_AT_DELIVERY', 'RETURNED_TO_ORIGIN']);
  });
});

describe('§7.2 order line (CNL-001)', () => {
  it('cancels only while the order is Placed, Confirmed or Packed', () => {
    for (const status of ORDER_STATUSES) {
      const allowed = ['PLACED', 'CONFIRMED', 'PACKED'].includes(status);
      expect(orderLineMachine.can('active', 'CUSTOMER_CANCELLED', { orderStatus: status }), status).toBe(allowed);
    }
    expect(orderLineMachine.can('cancelled', 'CUSTOMER_CANCELLED', { orderStatus: 'PLACED' })).toBe(false);
  });
});

const RETURN_EVENTS: ReturnEvent[] = ['APPROVE', 'REJECT', 'SCHEDULE_PICKUP', 'PICKUP_SUCCEEDED', 'PICKUP_FAILED', 'RESCHEDULE_PICKUP', 'REFUND_CREATED', 'REFUND_COMPLETED'];
const RETURN_COMMON = {
  'RETURN_REQUESTED:APPROVE': 'RETURN_APPROVED',
  'RETURN_REQUESTED:REJECT': 'RETURN_REJECTED',
  'RETURN_APPROVED:SCHEDULE_PICKUP': 'PICKUP_SCHEDULED',
  'PICKUP_SCHEDULED:PICKUP_SUCCEEDED': 'PICKED_UP',
  'PICKUP_FAILED:RESCHEDULE_PICKUP': 'PICKUP_SCHEDULED',
  'PICKED_UP:REFUND_CREATED': 'REFUND_INITIATED',
  'REFUND_INITIATED:REFUND_COMPLETED': 'REFUNDED',
} as const;

describe('§7.3 return request — exhaustive', () => {
  it('pickup attempt 1 failure → Pickup Failed', () => {
    exhaustive(returnMachine, RETURN_STATUSES, RETURN_EVENTS, { ...RETURN_COMMON, 'PICKUP_SCHEDULED:PICKUP_FAILED': 'PICKUP_FAILED' }, { pickupAttempt: 1 });
  });
  it('pickup attempt 2 failure → Return Closed', () => {
    exhaustive(returnMachine, RETURN_STATUSES, RETURN_EVENTS, { ...RETURN_COMMON, 'PICKUP_SCHEDULED:PICKUP_FAILED': 'RETURN_CLOSED' }, { pickupAttempt: 2 });
  });
});

describe('§7.4–7.7 other machines — exhaustive', () => {
  it('payment attempt: pending → one final outcome', () => {
    exhaustive(paymentAttemptMachine, ['pending', 'success', 'failure', 'cancelled', 'timed_out'], ['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT'], {
      'pending:SUCCEEDED': 'success', 'pending:FAILED': 'failure', 'pending:CANCELLED': 'cancelled', 'pending:TIMED_OUT': 'timed_out',
    });
  });
  it('refund: initiated → refunded', () => {
    exhaustive(refundMachine, ['initiated', 'refunded'], ['COMPLETE'], { 'initiated:COMPLETE': 'refunded' });
  });
  it('gift card: exhausted can be credited back; expired is final', () => {
    exhaustive(giftCardMachine, ['active', 'exhausted', 'expired'], ['BALANCE_EXHAUSTED', 'CREDITED', 'EXPIRED'], {
      'active:BALANCE_EXHAUSTED': 'exhausted', 'exhausted:CREDITED': 'active', 'active:EXPIRED': 'expired', 'exhausted:EXPIRED': 'expired',
    });
  });
  it('review: hidden on the third report; author can delete', () => {
    exhaustive(reviewMachine, ['visible', 'hidden', 'deleted'], ['THIRD_REPORT', 'AUTHOR_DELETED'], {
      'visible:THIRD_REPORT': 'hidden', 'visible:AUTHOR_DELETED': 'deleted', 'hidden:AUTHOR_DELETED': 'deleted',
    });
  });
});

describe('§7.8 account lock (AUTH-006, AUTH-009)', () => {
  const t0 = new Date('2026-10-06T10:00:00Z');
  it('locks on the 5th consecutive failure for 15 minutes', () => {
    let s = registerSuccess();
    for (let i = 0; i < 4; i += 1) s = registerFailure(s, t0);
    expect(isLocked(s, t0)).toBe(false);
    s = registerFailure(s, t0);
    expect(isLocked(s, t0)).toBe(true);
    expect(lockMinutesLeft(s, new Date(t0.getTime() + 60_000))).toBe(14);
    expect(isLocked(s, new Date(t0.getTime() + 15 * 60_000))).toBe(false);
  });
  it('ignores failures while locked and resets after success', () => {
    let s: LockState = { failedCount: 0, lockedUntil: new Date(t0.getTime() + 60_000) };
    expect(registerFailure(s, t0)).toBe(s);
    s = registerSuccess();
    expect(s).toEqual({ failedCount: 0, lockedUntil: null });
  });
});
