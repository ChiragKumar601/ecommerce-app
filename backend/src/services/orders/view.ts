import type { OrderStatus } from '@app/shared';
import type { AppContext } from '../../api/context.js';
import { AppError } from '../../domain/errors.js';
import { money } from '../../domain/money.js';
import type { Quote } from '../../domain/pricing/types.js';
import { formatIstDate, formatIstDateTime, istDate } from '../../domain/time.js';
import type { Order, OrderLine, PaymentAllocation } from '../../generated/prisma/client.js';
import { refundViews } from './refunds.js';
import { returnViews } from './returns.js';

// Order reads (ORD-002, ORD-003, PAY-013). Account-scoped: someone else's order is NOT_FOUND (ORD-007).

export const STATUS_LABELS: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: 'Awaiting Payment', PLACED: 'Placed', CONFIRMED: 'Confirmed', PACKED: 'Packed', SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for Delivery', DELIVERED: 'Delivered', DELIVERY_ATTEMPT_FAILED: 'Delivery Attempt Failed', FAILED: 'Failed',
  CANCELLED: 'Cancelled', REJECTED_AT_DELIVERY: 'Rejected at Delivery', RETURNED_TO_ORIGIN: 'Returned to Origin',
};

/** An Awaiting Payment order past its window shows as Failed even before the scheduler runs (ORD-002). */
export function effectiveStatus(o: Pick<Order, 'status' | 'retryEndsAt'>, now: Date): OrderStatus {
  return o.status === 'AWAITING_PAYMENT' && o.retryEndsAt <= now ? 'FAILED' : (o.status as OrderStatus);
}

/** ORD-006: the order status, plus after-sale suffixes such as "· 1 item cancelled". */
export function headlineStatus(status: OrderStatus, lines: Pick<OrderLine, 'lineState'>[], returnedUnits = 0): string {
  const parts = [STATUS_LABELS[status]];
  const cancelled = lines.filter((l) => l.lineState === 'cancelled').length;
  if (cancelled && status !== 'CANCELLED') parts.push(`${cancelled} item${cancelled === 1 ? '' : 's'} cancelled`);
  if (returnedUnits) parts.push(`${returnedUnits} item${returnedUnits === 1 ? '' : 's'} returned`);
  return parts.join(' · ');
}

interface Snapshot {
  name: string;
  brand: string;
  size: string;
  image: { url: string; alt: string } | null;
  href: string;
}

/** Payment breakdown (ORD-003, PAY-013): online, gift card and credits, and cash on delivery with its status. */
export function paymentBreakdown(allocs: PaymentAllocation[]) {
  const live = allocs.filter((a) => a.status !== 'released');
  const sum = (pred: (a: PaymentAllocation) => boolean) => live.filter(pred).reduce((n, a) => n + a.amount, 0);
  const cod = live.find((a) => a.source === 'cod');
  return {
    methods: live.map((a) => ({
      source: a.source, label: a.label ?? a.source, amount: money(a.amount),
      status: a.status === 'cod_due' ? 'Pay on delivery' : a.status === 'cod_collected' ? 'Collected' : a.status === 'reserved' ? 'Reserved' : 'Paid',
    })),
    paidOnline: money(sum((a) => a.source === 'card' || a.source === 'upi')),
    giftCard: money(sum((a) => a.source === 'gift_card')),
    credits: money(sum((a) => a.source === 'credits')),
    codDue: cod && cod.status === 'cod_due' ? money(cod.amount) : null,
    codCollected: cod && cod.status === 'cod_collected' ? money(cod.amount) : null,
  };
}

export async function ownOrder(ctx: AppContext, accountId: string, id: string) {
  const o = await ctx.db.order.findFirst({
    where: { id, accountId },
    include: { lines: { orderBy: { position: 'asc' } }, allocations: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { at: 'asc' } }, attempts: { orderBy: { createdAt: 'desc' } } },
  });
  if (!o) throw new AppError('NOT_FOUND');
  return o;
}

const DELIVERY_STEPS: OrderStatus[] = ['PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED'];

/** Order details (ORD-003) and the confirmation page (PAY-013), with tracking, the OTP and the Delivery simulator. */
export async function orderDetail(ctx: AppContext, accountId: string, id: string) {
  const o = await ownOrder(ctx, accountId, id);
  const now = ctx.clock.now();
  const status = effectiveStatus(o, now);
  const q = o.priceSnapshot as unknown as Quote;
  const returns = await returnViews(ctx, { id: o.id, status }, o.lines);
  const returnedUnits = [...returns.values()].reduce((n, r) => n + r.returnedUnits, 0);
  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status,
    statusLabel: STATUS_LABELS[status],
    headline: headlineStatus(status, o.lines, returnedUnits),
    date: formatIstDateTime(o.createdAt),
    placedAt: o.placedAt ? formatIstDateTime(o.placedAt) : null,
    contactPhone: o.contactPhone,
    address: o.addressSnapshot as Record<string, unknown>,
    expectedDelivery: o.placedAt ? `Delivery by ${formatIstDate(o.expectedDeliveryDate)}` : null,
    lines: o.lines.map((l) => ({
      id: l.id, variantId: l.variantId, productId: l.productId, ...(l.productSnapshot as unknown as Snapshot), quantity: l.quantity,
      unitPrice: money(l.unitSellingPrice), unitMrp: money(l.unitMrp), lineNetPaid: money(l.lineNetPaid), lineState: l.lineState, returnable: l.returnable,
      // CNL-001: Cancel is offered only while Placed, Confirmed or Packed.
      canCancel: l.lineState === 'active' && ['PLACED', 'CONFIRMED', 'PACKED'].includes(status),
      cancelled: l.lineState === 'cancelled' ? { at: l.cancelledAt ? formatIstDateTime(l.cancelledAt) : null, reason: l.cancelReason } : null,
      // RET-001…005: Return action, "Not returnable", "Return window closed on …", and this line's returns.
      returnInfo: returns.get(l.id) ?? null,
    })),
    amounts: {
      totalMrp: money(q.totalMrp), discountOnMrp: money(q.discountOnMrp), couponDiscount: money(q.couponDiscount), couponCode: o.couponCode,
      bankOfferDiscount: money(q.bankOfferDiscount), deliveryCharge: money(q.deliveryCharge), total: money(o.total), taxPortion: money(q.taxPortion),
      taxText: `Inclusive of ${money(q.taxPortion).display} tax`,
    },
    payment: paymentBreakdown(o.allocations),
    lastAttempt: o.attempts[0] ? { id: o.attempts[0].id, outcome: o.attempts[0].outcome, method: o.attempts[0].method, label: o.attempts[0].instrumentLabel } : null,
    retry: status === 'AWAITING_PAYMENT'
      ? { endsAt: o.retryEndsAt.toISOString(), minutesLeft: Math.max(0, Math.ceil((o.retryEndsAt.getTime() - now.getTime()) / 60_000)), canRetry: !o.attempts.some((a) => a.outcome === 'pending') }
      : null,
    timeline: o.events.map((e) => ({ status: e.toStatus, label: STATUS_LABELS[e.toStatus as OrderStatus], at: formatIstDateTime(e.at), actor: e.actor, note: e.note })),
    placedOn: istDate(o.createdAt),
    // ORD-003: tracking from Shipped onwards (T-14).
    tracking: o.courierName ? { courier: o.courierName, trackingId: o.trackingId } : null,
    // DLV-001: the OTP is shown from Out for Delivery onwards.
    deliveryOtp: o.deliveryOtp && ['OUT_FOR_DELIVERY', 'DELIVERY_ATTEMPT_FAILED', 'DELIVERED'].includes(status) && o.deliveryAttempt > 0 ? o.deliveryOtp : null,
    // DLV-002: the simulator panel while Out for Delivery.
    simulator: status === 'OUT_FOR_DELIVERY'
      ? { attempt: o.deliveryAttempt, triesLeft: Math.max(0, 5 - o.otpFailures), locked: o.otpFailures >= 5, windowEndsAt: o.nextTransitionAt?.toISOString() ?? null }
      : null,
    deliveredAt: o.deliveredAt ? formatIstDateTime(o.deliveredAt) : null,
    progress: {
      steps: DELIVERY_STEPS.map((s) => ({ status: s, label: STATUS_LABELS[s] })),
      current: DELIVERY_STEPS.indexOf(status === 'DELIVERY_ATTEMPT_FAILED' ? 'OUT_FOR_DELIVERY' : status),
    },
    hasUnseenUpdate: o.hasUnseenUpdate,
    refunds: await refundViews(ctx, o.id),
  };
}

const PAGE = 10;

/** Orders list (ORD-002): own orders, newest first, 10 per page. */
export async function listOrders(ctx: AppContext, accountId: string, page: number, pageSize = PAGE) {
  const now = ctx.clock.now();
  const [totalCount, rows] = await Promise.all([
    ctx.db.order.count({ where: { accountId } }),
    ctx.db.order.findMany({ where: { accountId }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize, include: { lines: { orderBy: { position: 'asc' } } } }),
  ]);
  // ORD-006: "· n items returned" on the list too.
  const returned = await ctx.db.returnRequest.groupBy({ by: ['orderId'], where: { orderId: { in: rows.map((o) => o.id) }, status: { in: ['PICKED_UP', 'REFUND_INITIATED', 'REFUNDED'] } }, _sum: { quantity: true } });
  const returnedBy = new Map(returned.map((r) => [r.orderId, r._sum.quantity ?? 0]));
  return {
    items: rows.map((o) => {
      const status = effectiveStatus(o, now);
      const first = o.lines[0]?.productSnapshot as unknown as Snapshot | undefined;
      const units = o.lines.reduce((n, l) => n + l.quantity, 0);
      return {
        id: o.id, orderNumber: o.orderNumber, date: formatIstDate(istDate(o.createdAt)), status, headline: headlineStatus(status, o.lines, returnedBy.get(o.id) ?? 0),
        image: first?.image ?? null, firstItem: first ? `${first.brand} ${first.name}` : '', moreCount: Math.max(0, o.lines.length - 1), units,
        total: money(o.total), hasUnseenUpdate: o.hasUnseenUpdate,
      };
    }),
    totalCount,
    page,
    pageCount: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/** Opening an order clears its unseen-update flag (PRF-007). */
export async function markOrderSeen(ctx: AppContext, accountId: string, id: string) {
  const r = await ctx.db.order.updateMany({ where: { id, accountId }, data: { hasUnseenUpdate: false } });
  if (r.count === 0) throw new AppError('NOT_FOUND');
}

export async function hasUnseenOrderUpdates(ctx: AppContext, accountId: string): Promise<boolean> {
  return !!(await ctx.db.order.findFirst({ where: { accountId, hasUnseenUpdate: true }, select: { id: true } }));
}
export type OrderDetail = Awaited<ReturnType<typeof orderDetail>>;
