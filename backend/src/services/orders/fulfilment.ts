import type { AppContext } from '../../api/context.js';
import { AppError } from '../../domain/errors.js';
import { randomString } from '../../domain/ids.js';
import { pickOne } from '../../domain/random.js';
import { MS } from '../../domain/time.js';
import type { Order } from '../../generated/prisma/client.js';
import { invalidateStock } from '../catalogue/snapshot.js';
import { simSettings, transition, withOrder, type SimSettings, type Tx } from './core.js';

// Fulfilment simulator and the Delivery simulator (spec §6.16, §6.17, §7.1; plan S16.1, S16.3).

/** Fictional couriers for the showcase (T-14). */
const COURIERS = ['SwiftShip Logistics (demo)', 'Parcelwala Express (demo)', 'Konark Couriers (demo)', 'Trailblaze Delivery (demo)'];
const OTP_TRIES = 5;

/** INV-004: every active line goes back on hand. An uncollected COD amount is no longer due (RFD-002). */
async function restockAndCloseCod(ctx: AppContext, tx: Tx, order: Order) {
  const lines = await tx.orderLine.findMany({ where: { orderId: order.id, lineState: 'active' } });
  for (const l of lines) await tx.$executeRawUnsafe('UPDATE "Inventory" SET "onHand" = "onHand" + ? WHERE "variantId" = ?', l.quantity, l.variantId);
  await tx.paymentAllocation.updateMany({ where: { orderId: order.id, source: 'cod', status: 'cod_due' }, data: { status: 'released' } });
  invalidateStock(ctx.db);
}

/** Ends a delivery attempt that wasn't completed: attempt 1 → Delivery Attempt Failed; attempt 2 → Returned to Origin (DLV-006). */
async function endAttempt(ctx: AppContext, tx: Tx, order: Order, sim: SimSettings, note?: string) {
  const now = ctx.clock.now();
  if (order.deliveryAttempt >= 2) {
    await transition(tx, order, 'HANDOVER_EXPIRED', 'scheduler', now, { nextTransitionAt: null, hasUnseenUpdate: true }, note);
    // The whole-order refund (RFD-003) is created here once refunds exist (Stage 17).
    await restockAndCloseCod(ctx, tx, order);
  } else {
    await transition(tx, order, 'HANDOVER_EXPIRED', 'scheduler', now, { nextTransitionAt: new Date(now.getTime() + sim.stepMs), hasUnseenUpdate: true }, note);
  }
}

/**
 * Scheduler: Placed → Confirmed → Packed → Shipped → Out for Delivery, one step per interval from the
 * previous transition (ORD-004); Delivery Attempt Failed → Out for Delivery (attempt 2, same OTP).
 * Each step is conditional on the current status, so running twice never applies a step twice (API-007).
 */
export async function advanceOrders(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.order.findMany({
    where: { status: { in: ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERY_ATTEMPT_FAILED'] }, nextTransitionAt: { lte: now } },
    select: { id: true },
    orderBy: { nextTransitionAt: 'asc' },
  });
  if (!due.length) return 0;
  const sim = await simSettings(ctx);
  let n = 0;
  for (const d of due) {
    await withOrder(ctx, d.id, async (tx, o) => {
      if (!o.nextTransitionAt || o.nextTransitionAt > now) return;
      const at = ctx.clock.now();
      const next = new Date(at.getTime() + sim.stepMs);
      switch (o.status) {
        case 'PLACED':
        case 'CONFIRMED':
          await transition(tx, o, 'TIMER', 'scheduler', at, { nextTransitionAt: next, hasUnseenUpdate: true });
          break;
        case 'PACKED':
          // T-14: courier and tracking ID from Shipped onwards.
          await transition(tx, o, 'TIMER', 'scheduler', at, {
            nextTransitionAt: next, hasUnseenUpdate: true, courierName: pickOne(ctx.random, COURIERS), trackingId: `TRK${randomString(10, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}`,
          });
          break;
        case 'SHIPPED':
        case 'DELIVERY_ATTEMPT_FAILED':
          // The handover window starts; the OTP is shown and the simulator is enabled (DLV-001, DLV-002).
          await transition(tx, o, 'TIMER', 'scheduler', at, {
            nextTransitionAt: new Date(at.getTime() + sim.handoverMs), hasUnseenUpdate: true, deliveryAttempt: o.deliveryAttempt + 1, otpFailures: 0,
          });
          break;
        default:
          return;
      }
      n += 1;
    });
  }
  return n;
}

/** Scheduler: an Out for Delivery handover window that ends unconfirmed ends that attempt (DLV-006). */
export async function expireHandovers(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.order.findMany({ where: { status: 'OUT_FOR_DELIVERY', nextTransitionAt: { lte: now } }, select: { id: true } });
  if (!due.length) return 0;
  const sim = await simSettings(ctx);
  let n = 0;
  for (const d of due) {
    await withOrder(ctx, d.id, async (tx, o) => {
      if (o.status !== 'OUT_FOR_DELIVERY' || !o.nextTransitionAt || o.nextTransitionAt > now) return;
      await endAttempt(ctx, tx, o, sim);
      n += 1;
    });
  }
  return n;
}

async function ownOutForDelivery(ctx: AppContext, accountId: string, orderId: string) {
  const own = await ctx.db.order.findFirst({ where: { id: orderId, accountId }, select: { id: true } });
  if (!own) throw new AppError('NOT_FOUND'); // ORD-007
}

/**
 * Delivery simulator — Confirm delivery (DLV-003, DLV-004): the correct OTP delivers the order; a wrong
 * one counts towards 5 per attempt, after which the attempt ends as if the window had expired (EC-22).
 */
export async function confirmDelivery(ctx: AppContext, accountId: string, orderId: string, otp: string) {
  await ownOutForDelivery(ctx, accountId, orderId);
  const sim = await simSettings(ctx);
  const windowDays = await ctx.settings.get<number>('returns.windowDays', 14);
  const result = await withOrder(ctx, orderId, async (tx, o) => {
    if (o.status !== 'OUT_FOR_DELIVERY') throw new AppError('ACTION_NOT_ALLOWED');
    if (o.otpFailures >= OTP_TRIES) throw new AppError('OTP_LOCKED');
    const now = ctx.clock.now();
    if (otp !== o.deliveryOtp) {
      const failures = o.otpFailures + 1;
      await tx.order.update({ where: { id: o.id }, data: { otpFailures: failures } });
      if (failures >= OTP_TRIES) {
        await endAttempt(ctx, tx, { ...o, otpFailures: failures }, sim, 'Too many incorrect OTPs');
        return 'locked' as const;
      }
      return 'wrong' as const;
    }
    await transition(tx, o, 'OTP_CONFIRMED', 'delivery_simulator', now, { deliveredAt: now, nextTransitionAt: null, hasUnseenUpdate: true });
    // Return windows start; reviews unlock; cash on delivery is collected (DLV-003).
    await tx.orderLine.updateMany({ where: { orderId: o.id, lineState: 'active', returnable: true }, data: { returnWindowEndsAt: new Date(now.getTime() + windowDays * MS.day) } });
    await tx.paymentAllocation.updateMany({ where: { orderId: o.id, source: 'cod', status: 'cod_due' }, data: { status: 'cod_collected' } });
    return 'delivered' as const;
  });
  if (result === 'wrong') throw new AppError('OTP_INCORRECT');
  if (result === 'locked') throw new AppError('OTP_LOCKED');
}

/** Delivery simulator — Customer rejected parcel (DLV-005): restock, whole-order refund, COD no longer due. */
export async function rejectDelivery(ctx: AppContext, accountId: string, orderId: string) {
  await ownOutForDelivery(ctx, accountId, orderId);
  await withOrder(ctx, orderId, async (tx, o) => {
    if (o.status !== 'OUT_FOR_DELIVERY') throw new AppError('ACTION_NOT_ALLOWED');
    await transition(tx, o, 'PARCEL_REJECTED', 'delivery_simulator', ctx.clock.now(), { nextTransitionAt: null, hasUnseenUpdate: true });
    // The whole-order refund (RFD-003) is created here once refunds exist (Stage 17).
    await restockAndCloseCod(ctx, tx, o);
  });
}
