import type { ReturnStatus } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { AppError } from '../../domain/errors.js';
import { newId } from '../../domain/ids.js';
import { money } from '../../domain/money.js';
import { pickOne, weightedPick } from '../../domain/random.js';
import { unitsRefundAmount } from '../../domain/refunds/allocate.js';
import { returnMachine, type ReturnEvent } from '../../domain/state/returnRequest.js';
import { formatIstDate, formatIstDateTime, istDate } from '../../domain/time.js';
import type { OrderLine, ReturnRequest } from '../../generated/prisma/client.js';
import { invalidateStock } from '../catalogue/snapshot.js';
import { simSettings, withOrder, type SimSettings, type Tx } from './core.js';
import { createRefund, previewAllocation } from './refunds.js';

// Returns (spec §6.19, §7.3; plan S18).

/** SD-54 */
export const RETURN_REASONS = ['Size too small', 'Size too large', 'Defective/damaged', 'Not as described', 'Received wrong item', 'Quality not as expected', 'Other'] as const;
/** SD-55 */
const REJECTION_REASONS = ['Item shows signs of use', 'Tags or packaging missing', "Item doesn't match our records"];
const CLOSED_MESSAGE = "Pickup couldn't be completed after 2 attempts. Your return has been closed.";

export const RETURN_LABELS: Record<ReturnStatus, string> = {
  RETURN_REQUESTED: 'Return Requested', RETURN_APPROVED: 'Return Approved', RETURN_REJECTED: 'Return Rejected', PICKUP_SCHEDULED: 'Pickup Scheduled',
  PICKUP_FAILED: 'Pickup Failed', PICKED_UP: 'Picked Up', RETURN_CLOSED: 'Return Closed', REFUND_INITIATED: 'Refund Initiated', REFUNDED: 'Refunded',
};

/** Returns still heading for a refund: not rejected and not closed. */
const COUNTING = (r: Pick<ReturnRequest, 'status'>) => r.status !== 'RETURN_REJECTED' && r.status !== 'RETURN_CLOSED';

/**
 * RET-001 eligibility for a line. Every unit already in a return is used up: open returns, and also
 * rejected (RET-004) and closed (RET-005) ones, which can't be resubmitted for the same units.
 */
export function returnEligibility(orderStatus: string, line: Pick<OrderLine, 'quantity' | 'lineState' | 'returnable' | 'returnWindowEndsAt'>, returns: Pick<ReturnRequest, 'status' | 'quantity'>[], now: Date) {
  const used = returns.reduce((n, r) => n + r.quantity, 0);
  const returnableQty = Math.max(0, line.quantity - used);
  const windowEnds = line.returnWindowEndsAt;
  if (orderStatus !== 'DELIVERED' || line.lineState !== 'active') return { canReturn: false, returnableQty: 0, message: null };
  if (!line.returnable) return { canReturn: false, returnableQty: 0, message: 'Not returnable' };
  if (!windowEnds || now >= windowEnds) return { canReturn: false, returnableQty: 0, message: windowEnds ? `Return window closed on ${formatIstDate(istDate(windowEnds))}` : 'Not returnable' };
  if (returnableQty === 0) return { canReturn: false, returnableQty: 0, message: null };
  return { canReturn: true, returnableQty, message: `Return by ${formatIstDate(istDate(windowEnds))}` };
}

async function loadLine(tx: Tx, orderId: string, lineId: string) {
  const line = await tx.orderLine.findFirst({ where: { id: lineId, orderId } });
  if (!line) throw new AppError('NOT_FOUND');
  const returns = await tx.returnRequest.findMany({ where: { orderLineId: lineId } });
  return { line, returns };
}

async function ownOrder(ctx: AppContext, accountId: string, orderId: string) {
  const o = await ctx.db.order.findFirst({ where: { id: orderId, accountId } });
  if (!o) throw new AppError('NOT_FOUND'); // ORD-007
  return o;
}

/** The units a new return would refund, in order after units already refunded or reserved by open returns (RFD-001). */
function estimateFor(line: OrderLine, returns: ReturnRequest[], qty: number) {
  const reserved = returns.filter((r) => COUNTING(r) && !r.refundId).reduce((n, r) => n + r.quantity, 0);
  const offset = Math.min(line.quantity - qty, line.refundedUnits + reserved);
  return unitsRefundAmount(line.lineNetPaid, line.quantity, offset, qty);
}

/** Return preview (RET-002 step 4): eligibility, the pickup address and the estimated refund. */
export async function returnPreview(ctx: AppContext, accountId: string, orderId: string, lineId: string, qty: number) {
  const order = await ownOrder(ctx, accountId, orderId);
  return ctx.db.$transaction(async (tx) => {
    const { line, returns } = await loadLine(tx, orderId, lineId);
    const e = returnEligibility(order.status, line, returns, ctx.clock.now());
    if (!e.canReturn) throw new AppError('ACTION_NOT_ALLOWED');
    const units = Math.min(Math.max(1, qty), e.returnableQty);
    const estimate = await previewAllocation(tx, order, estimateFor(line, returns, units), ctx.clock.now());
    return {
      line: { id: line.id, ...(line.productSnapshot as object), quantity: line.quantity },
      returnableQty: e.returnableQty,
      quantity: units,
      reasons: RETURN_REASONS,
      pickupAddress: order.addressSnapshot,
      refund: { amount: money(estimate.amount), destinations: estimate.destinations },
    };
  });
}

const forcedTag = (comment: string | null) => {
  const m = /#(approve|reject|pickupfail)\b/i.exec(comment ?? '');
  return m ? `#${m[1]!.toLowerCase()}` : null;
};

/** Create a return (RET-002): quantity 1…returnable, a reason, an optional comment (≤ 500). Starts in Return Requested. */
export async function createReturn(ctx: AppContext, accountId: string, orderId: string, lineId: string, d: { quantity: number; reason: string; comment?: string | null }) {
  await ownOrder(ctx, accountId, orderId);
  const sim = await simSettings(ctx);
  return withOrder(ctx, orderId, async (tx, order) => {
    const { line, returns } = await loadLine(tx, orderId, lineId);
    const e = returnEligibility(order.status, line, returns, ctx.clock.now());
    if (!e.canReturn || d.quantity > e.returnableQty) throw new AppError('ACTION_NOT_ALLOWED');
    const now = ctx.clock.now();
    const id = newId();
    const comment = d.comment?.trim() || null;
    await tx.returnRequest.create({
      data: {
        id, orderId, orderLineId: lineId, quantity: d.quantity, reason: d.reason, comment, status: 'RETURN_REQUESTED', outcomeForcedBy: forcedTag(comment),
        history: [{ status: 'RETURN_REQUESTED', at: now.toISOString() }], createdAt: now, nextTransitionAt: new Date(now.getTime() + sim.stepMs),
      },
    });
    return id;
  });
}

/** Applies one listed transition (§7.3) and records it in the return's history. */
async function move(tx: Tx, r: ReturnRequest, event: ReturnEvent, at: Date, data: Record<string, unknown>) {
  const to = returnMachine.next(r.status as ReturnStatus, event, { pickupAttempt: r.pickupAttempt });
  const history = [...((r.history as { status: string; at: string }[]) ?? []), { status: to, at: at.toISOString() }];
  const changed = await tx.returnRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: to, history, ...data } });
  if (changed.count === 0) throw new AppError('ACTION_NOT_ALLOWED');
  await tx.order.update({ where: { id: r.orderId }, data: { hasUnseenUpdate: true } });
  return { ...r, status: to, history, ...data } as ReturnRequest;
}

/**
 * Picked Up (RET-007): the returned units go back on hand and are refunded (RFD-001: the per-unit
 * shares of the next units, in order). The return then mirrors its refund (Refund Initiated).
 */
async function pickedUp(ctx: AppContext, tx: Tx, r: ReturnRequest, sim: SimSettings, at: Date) {
  const line = await tx.orderLine.findUniqueOrThrow({ where: { id: r.orderLineId } });
  const order = await tx.order.findUniqueOrThrow({ where: { id: r.orderId } });
  await tx.$executeRawUnsafe('UPDATE "Inventory" SET "onHand" = "onHand" + ? WHERE "variantId" = ?', r.quantity, line.variantId);
  const offset = Math.min(line.refundedUnits, line.quantity - r.quantity);
  const amount = unitsRefundAmount(line.lineNetPaid, line.quantity, offset, r.quantity);
  await tx.orderLine.update({ where: { id: line.id }, data: { refundedUnits: offset + r.quantity } });
  const refund = await createRefund(ctx, tx, order, 'return', amount, sim, { orderLineId: line.id, units: r.quantity, returnRequestId: r.id });
  const next = await move(tx, r, 'PICKUP_SUCCEEDED', at, { nextTransitionAt: null });
  // Nothing captured (cash never collected can't be refunded): the return is complete at pickup.
  if (refund) await move(tx, next, 'REFUND_CREATED', at, { refundId: refund.id });
  else await tx.returnRequest.update({ where: { id: r.id }, data: { closedReason: 'No payment to refund' } });
  invalidateStock(ctx.db);
}

/**
 * Scheduler (5 s): one step per interval (RET-003). Requested → Approved or Rejected (by weights, or
 * forced by #approve / #reject); Approved → Pickup Scheduled; Pickup Scheduled → Picked Up or Pickup
 * Failed (#pickupfail forces failure); Pickup Failed → Pickup Scheduled (attempt 2); a second failure
 * closes the return. Each step is conditional on the status (API-007) and serialised per order (API-008).
 */
export async function advanceReturns(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.returnRequest.findMany({
    where: { status: { in: ['RETURN_REQUESTED', 'RETURN_APPROVED', 'PICKUP_SCHEDULED', 'PICKUP_FAILED'] }, nextTransitionAt: { lte: now } },
    select: { id: true, orderId: true },
  });
  if (!due.length) return 0;
  const sim = await simSettings(ctx);
  const weights = await ctx.settings.get<{ approve: number; reject: number; pickupSuccess: number; pickupFail: number }>('sim.returnOutcomeWeights', { approve: 80, reject: 20, pickupSuccess: 80, pickupFail: 20 });
  let n = 0;
  for (const d of due) {
    await withOrder(ctx, d.orderId, async (tx) => {
      const r = await tx.returnRequest.findUniqueOrThrow({ where: { id: d.id } });
      if (!r.nextTransitionAt || r.nextTransitionAt > now) return;
      const at = ctx.clock.now();
      const next = new Date(at.getTime() + sim.stepMs);
      switch (r.status) {
        case 'RETURN_REQUESTED': {
          const approve = r.outcomeForcedBy === '#reject' ? false : r.outcomeForcedBy ? true : weightedPick(ctx.random, { yes: weights.approve, no: weights.reject }) === 'yes';
          if (approve) await move(tx, r, 'APPROVE', at, { nextTransitionAt: next });
          else await move(tx, r, 'REJECT', at, { nextTransitionAt: null, rejectionReason: pickOne(ctx.random, REJECTION_REASONS) });
          break;
        }
        case 'RETURN_APPROVED':
        case 'PICKUP_FAILED':
          await move(tx, r, r.status === 'RETURN_APPROVED' ? 'SCHEDULE_PICKUP' : 'RESCHEDULE_PICKUP', at, { nextTransitionAt: next, pickupAttempt: r.pickupAttempt + 1 });
          break;
        case 'PICKUP_SCHEDULED': {
          const fail = r.outcomeForcedBy === '#pickupfail' ? true : r.outcomeForcedBy === '#approve' ? false : weightedPick(ctx.random, { ok: weights.pickupSuccess, fail: weights.pickupFail }) === 'fail';
          if (!fail) await pickedUp(ctx, tx, r, sim, at);
          else if (r.pickupAttempt >= 2) await move(tx, r, 'PICKUP_FAILED', at, { nextTransitionAt: null, closedReason: CLOSED_MESSAGE });
          else await move(tx, r, 'PICKUP_FAILED', at, { nextTransitionAt: next });
          break;
        }
        default:
          return;
      }
      n += 1;
    });
  }
  return n;
}

/** Called when a return's refund completes: Refund Initiated → Refunded (spec §7.3 mirrors §7.5). */
export async function completeReturnForRefund(tx: Tx, refundId: string, at: Date) {
  const r = await tx.returnRequest.findFirst({ where: { refundId, status: 'REFUND_INITIATED' } });
  if (r) await move(tx, r, 'REFUND_COMPLETED', at, {});
}

/** Return information for each line on the order page (RET-001…005). */
export async function returnViews(ctx: AppContext, order: { id: string; status: string }, lines: OrderLine[]) {
  const all = await ctx.db.returnRequest.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } });
  const now = ctx.clock.now();
  const refunds = new Map((await ctx.db.refund.findMany({ where: { id: { in: all.map((r) => r.refundId).filter((x): x is string => !!x) } } })).map((r) => [r.id, r]));
  return new Map(lines.map((l) => {
    const mine = all.filter((r) => r.orderLineId === l.id);
    return [l.id, {
      ...returnEligibility(order.status, l, mine, now),
      returns: mine.map((r) => ({
        id: r.id, quantity: r.quantity, reason: r.reason, status: r.status, statusLabel: RETURN_LABELS[r.status as ReturnStatus],
        rejectionReason: r.rejectionReason, closedMessage: r.status === 'RETURN_CLOSED' ? CLOSED_MESSAGE : null,
        pickupAttempt: r.pickupAttempt, refund: r.refundId && refunds.get(r.refundId) ? money(refunds.get(r.refundId)!.amount) : null,
        history: ((r.history as { status: ReturnStatus; at: string }[]) ?? []).map((h) => ({ status: h.status, label: RETURN_LABELS[h.status], at: formatIstDateTime(new Date(h.at)) })),
        requestedAt: formatIstDateTime(r.createdAt),
      })),
      returnedUnits: mine.filter((r) => ['PICKED_UP', 'REFUND_INITIATED', 'REFUNDED'].includes(r.status)).reduce((n, r) => n + r.quantity, 0),
    }] as const;
  }));
}
