import type { OrderLineState, OrderStatus } from '@app/shared';
import { defineMachine } from './machine.js';
import { LINE_CANCELLABLE_STATUSES } from './order.js';

/** Order line (spec §7.2): only active → cancelled, and only while the order is Placed/Confirmed/Packed. */
export const orderLineMachine = defineMachine<OrderLineState, 'CUSTOMER_CANCELLED', { orderStatus: OrderStatus }>([
  {
    from: ['active'],
    event: 'CUSTOMER_CANCELLED',
    to: 'cancelled',
    guard: (c) => LINE_CANCELLABLE_STATUSES.includes(c?.orderStatus),
  },
]);
