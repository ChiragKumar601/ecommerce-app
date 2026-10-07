import type { OrderStatus } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { AppError } from '../../domain/errors.js';
import { newId } from '../../domain/ids.js';
import { money } from '../../domain/money.js';
import { LINE_CANCELLABLE_STATUSES } from '../../domain/state/order.js';
import { invalidateStock } from '../catalogue/snapshot.js';
import { simSettings, transition, withOrder, type Tx } from './core.js';
import { createRefund, previewAllocation } from './refunds.js';

// Cancellation (spec §6.18; plan S17.2). Cancelling an Awaiting Payment order lives in payment.ts (CNL-002).

/** CNL-005 */
export const CANCELLATION_REASONS = ['Ordered by mistake', 'Found a better price', 'Delivery time too long', 'Changed my mind', 'Other'] as const;

async function ownOrderId(ctx: AppContext, accountId: string, orderId: string) {
  const own = await ctx.db.order.findFirst({ where: { id: orderId, accountId }, select: { id: true } });
  if (!own) throw new AppError('NOT_FOUND'); // ORD-007
}

/**
 * What cancelling a line refunds (CNL-003): the line's remaining net paid; with the last active line,
 * the delivery charge too (CNL-004). On a COD order, the part not covered by captured wallet amounts is
 * simply no longer due (RFD-002).
 */
async function cancellationAmounts(tx: Tx, orderId: string, lineId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const lines = await tx.orderLine.findMany({ where: { orderId } });
  const line = lines.find((l) => l.id === lineId);
  if (!line) throw new AppError('NOT_FOUND');
  const last = lines.filter((l) => l.lineState === 'active').length === 1 && line.lineState === 'active';
  // Units already refunded through a return can't apply before delivery, so this is the whole line.
  const value = line.lineNetPaid + (last ? order.deliveryCharge : 0);
  return { order, line, last, value };
}

export async function cancelPreview(ctx: AppContext, accountId: string, orderId: string, lineId: string) {
  await ownOrderId(ctx, accountId, orderId);
  return ctx.db.$transaction(async (tx) => {
    const { order, line, last, value } = await cancellationAmounts(tx, orderId, lineId);
    if (!LINE_CANCELLABLE_STATUSES.includes(order.status as OrderStatus) || line.lineState !== 'active') throw new AppError('ACTION_NOT_ALLOWED');
    const refund = await previewAllocation(tx, order, value, ctx.clock.now());
    const cod = await tx.paymentAllocation.findFirst({ where: { orderId, source: 'cod', status: 'cod_due' } });
    const noLongerDue = cod ? Math.min(cod.amount, value - refund.amount) : 0;
    return {
      line: { id: line.id, ...(line.productSnapshot as object), quantity: line.quantity, lineNetPaid: money(line.lineNetPaid) },
      lastLine: last,
      includesDeliveryCharge: last && order.deliveryCharge > 0,
      deliveryCharge: money(last ? order.deliveryCharge : 0),
      refund: { amount: money(refund.amount), destinations: refund.destinations },
      codNoLongerDue: noLongerDue > 0 ? money(noLongerDue) : null,
      reasons: CANCELLATION_REASONS,
    };
  });
}

/**
 * Cancel a whole line (CNL-001, CNL-003, CNL-004). Serialised with the scheduler (API-008, EC-12):
 * a cancel arriving as the order ships either lands first or gets ACTION_NOT_ALLOWED.
 */
export async function cancelLine(ctx: AppContext, accountId: string, orderId: string, lineId: string, reason: string, comment: string | null) {
  await ownOrderId(ctx, accountId, orderId);
  const sim = await simSettings(ctx);
  await withOrder(ctx, orderId, async (tx, order) => {
    if (!LINE_CANCELLABLE_STATUSES.includes(order.status as OrderStatus)) throw new AppError('ACTION_NOT_ALLOWED');
    const { line, last, value } = await cancellationAmounts(tx, orderId, lineId);
    if (line.lineState !== 'active') throw new AppError('ACTION_NOT_ALLOWED');
    const now = ctx.clock.now();
    await tx.orderLine.update({ where: { id: line.id }, data: { lineState: 'cancelled', cancelledAt: now, cancelReason: reason, cancelComment: comment, refundedUnits: line.quantity } });
    // INV-004: stock comes back.
    await tx.$executeRawUnsafe('UPDATE "Inventory" SET "onHand" = "onHand" + ? WHERE "variantId" = ?', line.quantity, line.variantId);
    const refund = await createRefund(ctx, tx, order, 'cancellation', value, sim, { includesDeliveryCharge: last && order.deliveryCharge > 0, orderLineId: line.id, units: line.quantity });
    // COD: what the captured wallet didn't cover is simply no longer due.
    const cod = await tx.paymentAllocation.findFirst({ where: { orderId, source: 'cod', status: 'cod_due' } });
    if (cod) {
      const due = Math.max(0, cod.amount - (value - (refund?.amount ?? 0)));
      await tx.paymentAllocation.update({ where: { id: cod.id }, data: due > 0 ? { amount: due } : { status: 'released' } });
    }
    if (last) await transition(tx, order, 'ALL_LINES_CANCELLED', 'customer', now, { nextTransitionAt: null }, reason);
    else await tx.orderStatusEvent.create({ data: { id: newId(), orderId, fromStatus: order.status, toStatus: order.status, at: now, actor: 'customer', note: `Item cancelled: ${(line.productSnapshot as { name?: string }).name ?? ''}` } });
  });
  invalidateStock(ctx.db);
}
