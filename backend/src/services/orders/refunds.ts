import type { AppContext } from '../../api/context.js';
import { newId } from '../../domain/ids.js';
import { money, type Paise } from '../../domain/money.js';
import { allocateRefund, type CapturedSource } from '../../domain/refunds/allocate.js';
import { formatIstDateTime } from '../../domain/time.js';
import type { Order } from '../../generated/prisma/client.js';
import { withOrder, type SimSettings, type Tx } from './core.js';

// Refunds (spec §6.20; plan S17.1): allocation from the pure domain module, ledger and gift-card
// entries at Refunded, an expired gift card refunded as credits, and the RFD-007 cap.

export type RefundTrigger = 'cancellation' | 'return' | 'rejected_at_delivery' | 'returned_to_origin';

export const TRIGGER_LABELS: Record<RefundTrigger, string> = {
  cancellation: 'Cancellation', return: 'Return', rejected_at_delivery: 'Rejected at delivery', returned_to_origin: 'Returned to origin',
};

interface SourceRow extends CapturedSource {
  label: string;
}

/**
 * The order's captured sources with what was already refunded to each (RFD-002). Card and UPI are
 * captured online; COD counts only once collected; uncollected COD is never refunded.
 */
export async function capturedSources(tx: Tx, order: Pick<Order, 'id'>, now: Date): Promise<SourceRow[]> {
  const [allocs, refunded] = await Promise.all([
    tx.paymentAllocation.findMany({ where: { orderId: order.id, status: { in: ['captured', 'cod_collected'] } } }),
    tx.refundAllocation.findMany({ where: { refund: { orderId: order.id } } }),
  ]);
  const giftCards = await tx.accountGiftCard.findMany({ where: { id: { in: allocs.map((a) => a.accountGiftCardId).filter((x): x is string => !!x) } } });
  const expiry = new Map(giftCards.map((g) => [g.id, g.status === 'expired' || g.expiresAt <= now]));
  const codes = new Map(giftCards.map((g) => [g.id, g.code]));
  return allocs.map((a) => {
    const source = a.source as CapturedSource['source'];
    const done = refunded.filter((r) => r.source === source && (source !== 'gift_card' || r.accountGiftCardId === a.accountGiftCardId)).reduce((n, r) => n + r.amount, 0);
    const label = source === 'gift_card' ? `Gift card •••• ${(codes.get(a.accountGiftCardId ?? '') ?? '').slice(-4)}` : source === 'credits' ? 'Credits' : source === 'cod' ? 'Credits' : (a.label ?? source.toUpperCase());
    return { source, amount: a.amount, refunded: done, accountGiftCardId: a.accountGiftCardId, giftCardExpired: expiry.get(a.accountGiftCardId ?? '') ?? false, label };
  });
}

/** Total that may still be refunded: captured plus collected, minus every refund so far (RFD-007). */
export async function refundableRemaining(tx: Tx, orderId: string): Promise<Paise> {
  const [allocs, refunds] = await Promise.all([
    tx.paymentAllocation.aggregate({ where: { orderId, status: { in: ['captured', 'cod_collected'] } }, _sum: { amount: true } }),
    tx.refund.aggregate({ where: { orderId }, _sum: { amount: true } }),
  ]);
  return Math.max(0, (allocs._sum.amount ?? 0) - (refunds._sum.amount ?? 0));
}

const destinationLabel = (d: { destination: string; amount: number; note?: string }, sources: SourceRow[], sourceKey: string, giftCardId?: string | null) => {
  if (d.destination === 'card' || d.destination === 'upi') return sources.find((s) => s.source === d.destination)?.label ?? d.destination.toUpperCase();
  if (d.destination === 'gift_card') return sources.find((s) => s.source === 'gift_card' && s.accountGiftCardId === giftCardId)?.label ?? 'Gift card';
  return sourceKey === 'gift_card' ? 'Credits (gift card expired)' : 'Credits';
};

/** Splits an allocation's destinations back into rows that remember their source (for later caps). */
function allocationRows(requested: Paise, sources: SourceRow[]) {
  const rows: { source: string; destination: string; amount: Paise; accountGiftCardId: string | null; label: string; note: string | null }[] = [];
  let remaining = requested;
  // Walk the same order as allocateRefund, one source at a time, so each row knows its source.
  for (const s of [...sources].sort((a, b) => ORDER.indexOf(a.source) - ORDER.indexOf(b.source))) {
    if (remaining === 0) break;
    const one = allocateRefund(remaining, [s]);
    if (one.amount === 0) continue;
    remaining -= one.amount;
    for (const d of one.destinations) {
      const giftCardId = d.destination === 'gift_card' ? d.accountGiftCardId : s.source === 'gift_card' ? (s.accountGiftCardId ?? null) : null;
      rows.push({
        source: s.source, destination: d.destination, amount: d.amount, accountGiftCardId: giftCardId,
        label: destinationLabel(d, sources, s.source, giftCardId), note: 'note' in d && d.note ? d.note : null,
      });
    }
  }
  return { amount: requested - remaining, rows };
}
const ORDER: CapturedSource['source'][] = ['card', 'upi', 'gift_card', 'credits', 'cod'];

/** Refund preview (CNL-003, RET-002): the amount and where it would go, without writing anything. */
export async function previewAllocation(tx: Tx, order: Pick<Order, 'id'>, requested: Paise, now: Date) {
  const sources = await capturedSources(tx, order, now);
  const cap = await refundableRemaining(tx, order.id);
  const { amount, rows } = allocationRows(Math.min(requested, cap), sources);
  return { amount, destinations: rows.map((r) => ({ label: r.label, amount: money(r.amount) })) };
}

/**
 * Creates a refund in Refund Initiated (RFD-005), capped by RFD-007, allocated card/UPI → gift card →
 * credits → collected COD (RFD-002). Nothing is created when nothing was captured. Runs inside the
 * caller's order transaction.
 */
export async function createRefund(ctx: AppContext, tx: Tx, order: Pick<Order, 'id'>, trigger: RefundTrigger, requested: Paise, sim: SimSettings, extra: { includesDeliveryCharge?: boolean; orderLineId?: string; units?: number; returnRequestId?: string } = {}) {
  const now = ctx.clock.now();
  const cap = await refundableRemaining(tx, order.id);
  const sources = await capturedSources(tx, order, now);
  const { amount, rows } = allocationRows(Math.min(requested, cap), sources);
  if (amount === 0) return null;
  const id = newId();
  await tx.refund.create({
    data: {
      id, orderId: order.id, trigger, amount, includesDeliveryCharge: !!extra.includesDeliveryCharge, orderLineId: extra.orderLineId ?? null,
      units: extra.units ?? null, returnRequestId: extra.returnRequestId ?? null, status: 'initiated', createdAt: now, completeAt: new Date(now.getTime() + sim.stepMs),
      allocations: { create: rows.map((r) => ({ id: newId(), ...r })) },
    },
  });
  await tx.order.update({ where: { id: order.id }, data: { hasUnseenUpdate: true } });
  return { id, amount };
}

/**
 * Whole-order refund (RFD-003) for Rejected at Delivery and Returned to Origin: every active line's
 * net paid plus the delivery charge, capped at what was captured or collected (EC-09).
 */
export async function wholeOrderRefund(ctx: AppContext, tx: Tx, order: Order, trigger: 'rejected_at_delivery' | 'returned_to_origin', sim: SimSettings) {
  const lines = await tx.orderLine.findMany({ where: { orderId: order.id, lineState: 'active' } });
  const amount = lines.reduce((n, l) => n + l.lineNetPaid, 0) + order.deliveryCharge;
  return createRefund(ctx, tx, order, trigger, amount, sim, { includesDeliveryCharge: order.deliveryCharge > 0 });
}

/**
 * Scheduler (5 s): Refund Initiated → Refunded after one step (RFD-005). Credits get a `refund_credit`
 * ledger entry; a gift card still active and unexpired is credited back, otherwise the amount goes
 * to credits with "Gift card expired — refunded as credits" (RFD-004). Card and UPI are display-only.
 * Conditional on the status, so a second run never applies a refund twice (API-007).
 */
export async function completeRefunds(ctx: AppContext): Promise<number> {
  const now = ctx.clock.now();
  const due = await ctx.db.refund.findMany({ where: { status: 'initiated', completeAt: { lte: now } }, select: { id: true, orderId: true } });
  let n = 0;
  for (const d of due) {
    await withOrder(ctx, d.orderId, async (tx, order) => {
      const changed = await tx.refund.updateMany({ where: { id: d.id, status: 'initiated' }, data: { status: 'refunded', completedAt: ctx.clock.now() } });
      if (changed.count === 0) return;
      const allocs = await tx.refundAllocation.findMany({ where: { refundId: d.id } });
      for (const a of allocs) {
        if (a.destination === 'gift_card' && a.accountGiftCardId) {
          const g = await tx.accountGiftCard.findUnique({ where: { id: a.accountGiftCardId } });
          if (g && g.status !== 'expired' && g.expiresAt > now) {
            await tx.$executeRawUnsafe('UPDATE "AccountGiftCard" SET "balance" = "balance" + ?, "status" = \'active\' WHERE "id" = ?', a.amount, g.id);
            await tx.giftCardTxn.create({ data: { id: newId(), accountGiftCardId: g.id, amount: a.amount, type: 'refund_credit', orderId: order.id, createdAt: now } });
            continue;
          }
          await tx.refundAllocation.update({ where: { id: a.id }, data: { destination: 'credits', label: 'Credits (gift card expired)', note: 'gift_card_expired' } });
        }
        if (a.destination === 'credits' || a.destination === 'gift_card') {
          const note = a.source === 'gift_card' ? 'Gift card expired — refunded as credits' : 'Refund';
          await tx.creditLedgerEntry.create({ data: { id: newId(), accountId: order.accountId, amount: a.amount, type: 'refund_credit', orderId: order.id, refundId: d.id, note, createdAt: now } });
        }
      }
      await tx.order.update({ where: { id: order.id }, data: { hasUnseenUpdate: true } });
      n += 1;
    });
  }
  return n;
}

/** Refund list for the order page (RFD-006). */
export async function refundViews(ctx: AppContext, orderId: string) {
  const rows = await ctx.db.refund.findMany({ where: { orderId }, orderBy: { createdAt: 'asc' }, include: { allocations: true } });
  return rows.map((r) => ({
    id: r.id,
    trigger: r.trigger,
    triggerLabel: TRIGGER_LABELS[r.trigger as RefundTrigger] ?? r.trigger,
    amount: money(r.amount),
    includesDeliveryCharge: r.includesDeliveryCharge,
    destinations: r.allocations.map((a) => ({ label: a.label, amount: money(a.amount) })),
    summary: r.allocations.map((a) => `${money(a.amount).display} to ${a.label}`).join(', '),
    status: r.status,
    statusLabel: r.status === 'refunded' ? 'Refunded' : 'Refund Initiated',
    initiatedAt: formatIstDateTime(r.createdAt),
    refundedAt: r.completedAt ? formatIstDateTime(r.completedAt) : null,
    orderLineId: r.orderLineId,
    units: r.units,
  }));
}
