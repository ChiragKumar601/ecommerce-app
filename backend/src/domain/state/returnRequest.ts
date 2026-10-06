import type { ReturnStatus } from '@app/shared';
import { defineMachine } from './machine.js';

export type ReturnEvent =
  | 'APPROVE'
  | 'REJECT'
  | 'SCHEDULE_PICKUP'
  | 'PICKUP_SUCCEEDED'
  | 'PICKUP_FAILED'
  | 'RESCHEDULE_PICKUP'
  | 'REFUND_CREATED'
  | 'REFUND_COMPLETED';

/** `pickupAttempt` is the current pickup attempt (1 or 2). */
export interface ReturnContext {
  pickupAttempt: number;
}

/** Return request (spec §7.3). The customer can't cancel a return request in V1 (SD-58). */
export const returnMachine = defineMachine<ReturnStatus, ReturnEvent, ReturnContext>([
  { from: ['RETURN_REQUESTED'], event: 'APPROVE', to: 'RETURN_APPROVED' },
  { from: ['RETURN_REQUESTED'], event: 'REJECT', to: 'RETURN_REJECTED' },
  { from: ['RETURN_APPROVED'], event: 'SCHEDULE_PICKUP', to: 'PICKUP_SCHEDULED' },
  { from: ['PICKUP_SCHEDULED'], event: 'PICKUP_SUCCEEDED', to: 'PICKED_UP' },
  { from: ['PICKUP_SCHEDULED'], event: 'PICKUP_FAILED', to: 'PICKUP_FAILED', guard: (c) => c?.pickupAttempt === 1 },
  { from: ['PICKUP_SCHEDULED'], event: 'PICKUP_FAILED', to: 'RETURN_CLOSED', guard: (c) => c?.pickupAttempt === 2 },
  { from: ['PICKUP_FAILED'], event: 'RESCHEDULE_PICKUP', to: 'PICKUP_SCHEDULED' },
  { from: ['PICKED_UP'], event: 'REFUND_CREATED', to: 'REFUND_INITIATED' },
  { from: ['REFUND_INITIATED'], event: 'REFUND_COMPLETED', to: 'REFUNDED' },
]);

export const TERMINAL_RETURN_STATUSES: readonly ReturnStatus[] = ['RETURN_REJECTED', 'RETURN_CLOSED', 'REFUNDED'];
