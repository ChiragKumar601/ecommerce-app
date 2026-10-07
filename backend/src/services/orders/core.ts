import type { OrderStatus } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { AppError } from '../../domain/errors.js';
import { newId, randomUpperAlnum } from '../../domain/ids.js';
import { randomIntBetween } from '../../domain/random.js';
import { orderMachine, type OrderEvent } from '../../domain/state/order.js';
import { addDays, istDate } from '../../domain/time.js';
import type { Order, PrismaClient } from '../../generated/prisma/client.js';
import { invalidateStock } from '../catalogue/snapshot.js';

// Order building blocks shared by payment, fulfilment, cancellation and the scheduler (plan §7.5).

export type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
export type Actor = 'customer' | 'scheduler' | 'delivery_simulator' | 'system';

// The libSQL adapter reports SQLITE_BUSY as "Operation has timed out".
const BUSY = /SQLITE_BUSY|database is locked|Operation has timed out/i;

/** Runs a write transaction, retrying SQLITE_BUSY up to 3 times with jitter (plan §6.3). */
export async function writeTx<T>(ctx: AppContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ctx.db.$transaction(fn, { timeout: 15_000, maxWait: 15_000 });
    } catch (e) {
      if (attempt >= 3 || !BUSY.test(String((e as Error)?.message ?? e))) throw e;
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 80));
    }
  }
}

/**
 * Serialises work on one order (API-008, EC-12): the transaction starts by writing to the order row,
 * which takes SQLite's write lock, then re-reads its current state for the caller to check.
 */
export async function withOrder<T>(ctx: AppContext, orderId: string, fn: (tx: Tx, order: Order) => Promise<T>): Promise<T> {
  return writeTx(ctx, async (tx) => {
    const touched = await tx.$executeRawUnsafe('UPDATE "Order" SET "version" = "version" + 1 WHERE "id" = ?', orderId);
    if (touched === 0) throw new AppError('NOT_FOUND');
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    return fn(tx, order);
  });
}

/** ORD-001: `ORD-<YYMMDD>-<5 random uppercase alphanumerics>`, unique. */
export async function newOrderNumber(ctx: AppContext, tx: Tx, now: Date): Promise<string> {
  const day = istDate(now).slice(2).replace(/-/g, '');
  for (;;) {
    const n = `ORD-${day}-${randomUpperAlnum(5)}`;
    if (!(await tx.order.findUnique({ where: { orderNumber: n }, select: { id: true } }))) return n;
  }
}

/** Applies a listed transition (spec §7.1) and records the event with its actor. */
export async function transition(tx: Tx, order: Pick<Order, 'id' | 'status' | 'deliveryAttempt'>, event: OrderEvent, actor: Actor, at: Date, data: Record<string, unknown> = {}, note?: string): Promise<OrderStatus> {
  const to = orderMachine.next(order.status as OrderStatus, event, { deliveryAttempt: order.deliveryAttempt });
  const changed = await tx.order.updateMany({ where: { id: order.id, status: order.status }, data: { status: to, ...data } });
  if (changed.count === 0) throw new AppError('ACTION_NOT_ALLOWED');
  await tx.orderStatusEvent.create({ data: { id: newId(), orderId: order.id, fromStatus: order.status, toStatus: to, at, actor, note: note ?? null } });
  return to;
}

/**
 * Simulator settings (spec §5), read before a write transaction starts. Nothing inside a transaction
 * may touch `ctx.db` or the settings cache: the database connection is the transaction's until it ends.
 */
export interface SimSettings {
  stepMs: number;
  handoverMs: number;
  retryWindowMs: number;
  paymentWeights: Record<'success' | 'failure' | 'cancelled' | 'timed_out', number>;
  revealMs: { min: number; max: number };
}

export async function simSettings(ctx: AppContext): Promise<SimSettings> {
  const [stepMs, handoverMs, retryWindowMs, paymentWeights, revealMs] = await Promise.all([
    ctx.settings.get<number>('sim.statusStepIntervalMs', 120_000),
    ctx.settings.get<number>('sim.deliveryHandoverWindowMs', 600_000),
    ctx.settings.get<number>('sim.paymentRetryWindowMs', 900_000),
    ctx.settings.get<SimSettings['paymentWeights']>('sim.paymentOutcomeWeights', { success: 70, failure: 15, cancelled: 10, timed_out: 5 }),
    ctx.settings.get<{ min: number; max: number }>('sim.paymentRevealMs', { min: 2000, max: 3000 }),
  ]);
  return { stepMs, handoverMs, retryWindowMs, paymentWeights, revealMs };
}

/**
 * AWAITING_PAYMENT → PLACED (PAY-008, PAY-009, §7.1): commit held stock (INV-002), capture wallet
 * reservations, generate the delivery OTP (DLV-001), schedule fulfilment, and — for bag checkouts —
 * remove the purchased lines from the bag.
 */
export async function placeOrder(ctx: AppContext, tx: Tx, order: Order, actor: Actor, sim: SimSettings) {
  const now = ctx.clock.now();
  const lines = await tx.orderLine.findMany({ where: { orderId: order.id } });
  for (const l of lines) {
    await tx.$executeRawUnsafe('UPDATE "Inventory" SET "onHand" = "onHand" - ?, "held" = "held" - ? WHERE "variantId" = ?', l.quantity, l.quantity, l.variantId);
  }
  await tx.paymentAllocation.updateMany({ where: { orderId: order.id, status: 'reserved' }, data: { status: 'captured' } });
  const otp = String(randomIntBetween(ctx.random, 0, 9999)).padStart(4, '0');
  const zoneDays = (await tx.deliveryZone.findUnique({ where: { zone: order.zone } }))?.deliveryDays ?? 6;
  await transition(tx, order, 'PAYMENT_SUCCEEDED', actor, now, {
    placedAt: now, deliveryOtp: otp, expectedDeliveryDate: addDays(istDate(now), zoneDays),
    nextTransitionAt: new Date(now.getTime() + sim.stepMs),
  });
  if (order.source === 'bag') {
    await tx.bagLine.deleteMany({ where: { accountId: order.accountId, variantId: { in: lines.map((l) => l.variantId) } } });
    if (order.couponCode) await tx.bag.updateMany({ where: { accountId: order.accountId, couponCode: order.couponCode }, data: { couponCode: null } });
  }
  invalidateStock(ctx.db);
}

/** Gives reserved wallet amounts back (`order_debit_reversal`) and marks the allocations released. */
export async function reverseReservations(ctx: AppContext, tx: Tx, order: Pick<Order, 'id' | 'accountId'>) {
  const now = ctx.clock.now();
  const reserved = await tx.paymentAllocation.findMany({ where: { orderId: order.id, status: 'reserved' } });
  for (const a of reserved) {
    if (a.source === 'gift_card' && a.accountGiftCardId) {
      await tx.$executeRawUnsafe('UPDATE "AccountGiftCard" SET "balance" = "balance" + ?, "status" = CASE WHEN "status" = \'expired\' THEN \'expired\' ELSE \'active\' END WHERE "id" = ?', a.amount, a.accountGiftCardId);
      await tx.giftCardTxn.create({ data: { id: newId(), accountGiftCardId: a.accountGiftCardId, amount: a.amount, type: 'order_debit_reversal', orderId: order.id, createdAt: now } });
    } else if (a.source === 'credits') {
      await tx.creditLedgerEntry.create({ data: { id: newId(), accountId: order.accountId, amount: a.amount, type: 'order_debit_reversal', orderId: order.id, note: 'Returned from an unpaid order', createdAt: now } });
    }
  }
  await tx.paymentAllocation.updateMany({ where: { orderId: order.id, status: 'reserved' }, data: { status: 'released' } });
}

/** AWAITING_PAYMENT → FAILED or CANCELLED: release holds (INV-003) and reverse reservations (PAY-012, CNL-002). */
export async function releaseOrder(ctx: AppContext, tx: Tx, order: Order, event: 'PAYMENT_WINDOW_EXPIRED' | 'CUSTOMER_CANCELLED_PENDING', actor: Actor) {
  const now = ctx.clock.now();
  const lines = await tx.orderLine.findMany({ where: { orderId: order.id } });
  for (const l of lines) await tx.$executeRawUnsafe('UPDATE "Inventory" SET "held" = "held" - ? WHERE "variantId" = ?', l.quantity, l.variantId);
  await reverseReservations(ctx, tx, order);
  await transition(tx, order, event, actor, now, { hasUnseenUpdate: event === 'PAYMENT_WINDOW_EXPIRED' });
  invalidateStock(ctx.db);
}
