import { otpSchema } from '@app/shared';
import { Check, ChevronLeft, ChevronRight, KeyRound, Package, PackageX, Truck } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, InlineMessage, Input, PageLayout, Skeleton } from '../../components/ui';
import { CancelDialog, RefundList } from '../../components/orders/CancelDialog';
import { orderKey, useOrder, useOrders, type OrderDetail } from '../../features/orders';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';

const tone = (status: string) =>
  status === 'DELIVERED' ? 'success' : ['FAILED', 'CANCELLED', 'REJECTED_AT_DELIVERY', 'RETURNED_TO_ORIGIN'].includes(status) ? 'danger' : status === 'AWAITING_PAYMENT' || status === 'DELIVERY_ATTEMPT_FAILED' ? 'warning' : 'info';

// ── Orders list (ORD-002) ────────────────────────────────────────────────────

export function OrdersPage() {
  const q = useOrders();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <PageLayout narrow>
      <Link to="/account" className="mb-3 inline-flex min-h-9 items-center gap-1 text-small font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />My account</Link>
      <h1 className="mb-6 text-h2 font-bold md:text-h1">Orders</h1>
      {q.isError && !q.data ? <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /> : !q.data ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Package className="size-7" aria-hidden="true" />} title="No orders yet" description="When you place an order, you'll be able to track it here." action={<Button asChild><Link to="/">Start shopping</Link></Button>} />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {items.map((o) => (
              <li key={o.id}>
                <Link to={`/account/orders/${o.id}`} className="group flex items-center gap-4 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink" aria-label={`Order ${o.orderNumber}, ${o.headline}, ${o.total.display}${o.hasUnseenUpdate ? ', updated' : ''}`}>
                  <div className="relative w-16 shrink-0">
                    {o.image ? <img src={o.image.url} alt="" width={64} height={85} className="aspect-[3/4] w-16 rounded-md object-cover" loading="lazy" /> : <span className="block aspect-[3/4] rounded-md bg-surface-muted" />}
                    {o.moreCount > 0 && <span className="absolute -bottom-1.5 -right-1.5 rounded-full bg-ink px-1.5 text-caption font-bold text-white">+{o.moreCount}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge tone={tone(o.status)} size="md">{o.headline}</Badge>
                      {o.hasUnseenUpdate && <span className="size-2 rounded-full bg-brand" aria-hidden="true" />}
                    </p>
                    <p className="mt-1.5 truncate text-small font-semibold">{o.firstItem}{o.moreCount > 0 && <span className="font-normal text-ink-muted"> +{o.moreCount} more</span>}</p>
                    <p className="text-caption text-ink-muted">{o.orderNumber} · {o.date}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular font-bold">{o.total.display}</span>
                    <ChevronRight className="size-4 text-ink-muted" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {q.hasNextPage && <div className="mt-6 flex justify-center"><Button variant="secondary" loading={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
        </>
      )}
    </PageLayout>
  );
}

// ── Detail (ORD-003) ─────────────────────────────────────────────────────────

/** Progress across the delivery steps, plus the event list with timestamps (ORD-003). */
function OrderTimeline({ o }: { o: OrderDetail }) {
  const off = ['FAILED', 'CANCELLED', 'REJECTED_AT_DELIVERY', 'RETURNED_TO_ORIGIN', 'AWAITING_PAYMENT'].includes(o.status);
  return (
    <section aria-labelledby="tl-h" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="tl-h" className="mb-4 font-semibold">Order status</h2>
      {!off && (
        <ol className="mb-5 grid grid-cols-6 gap-1" aria-label="Delivery progress">
          {o.progress.steps.map((s, i) => {
            const done = i <= o.progress.current;
            return (
              <li key={s.status} className="flex flex-col items-center gap-1.5 text-center" aria-current={i === o.progress.current ? 'step' : undefined}>
                <span className={cn('flex size-7 items-center justify-center rounded-full border-2', done ? 'border-success bg-success text-white' : 'border-line-strong bg-surface')}>
                  {done && <Check className="size-4" aria-hidden="true" />}
                </span>
                <span className={cn('text-[0.6875rem] leading-tight sm:text-caption', done ? 'font-semibold text-ink' : 'text-ink-muted')}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      <ol className="relative flex flex-col gap-3 border-l-2 border-line pl-5">
        {[...o.timeline].reverse().map((e, i) => (
          <li key={`${e.status}-${i}`} className="relative">
            <span className={cn('absolute -left-[1.6875rem] top-1 size-3 rounded-full ring-4 ring-surface', i === 0 ? 'bg-ink' : 'bg-line-strong')} aria-hidden="true" />
            <p className={cn('text-small', i === 0 ? 'font-bold' : 'font-medium')}>{e.label}{e.note && <span className="font-normal text-ink-muted"> · {e.note}</span>}</p>
            <p className="text-caption text-ink-muted">{e.at}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** "Delivery simulator (demo)" (DLV-002…005): OTP confirm and customer rejection, on the order owner's page. */
function DeliverySimulatorPanel({ o }: { o: OrderDetail }) {
  const sim = o.simulator!;
  const id = useId();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      queryClient.setQueryData(orderKey(o.id), await api<OrderDetail>(`/orders/${o.id}/delivery-sim/${path}`, { method: 'POST', body }));
      setOtp('');
    } catch (e) {
      setOtp(''); // ERR-001: OTPs are never kept
      setError(errorMessage(e));
      if (e instanceof ApiError && (e.code === 'OTP_LOCKED' || e.code === 'ACTION_NOT_ALLOWED')) void queryClient.invalidateQueries({ queryKey: orderKey(o.id) });
    } finally {
      setBusy(false);
      setRejecting(false);
    }
  };
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-xl border-2 border-dashed border-info/50 bg-info-soft/60 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-h`} className="flex items-center gap-2 font-bold text-info"><Truck className="size-5" aria-hidden="true" />Delivery simulator (demo)</h2>
        <Badge tone="info">Attempt {sim.attempt} of 2</Badge>
      </div>
      <p className="mt-1 text-small text-ink-soft">Play the delivery person: enter the customer's OTP to hand over the parcel.</p>
      {sim.locked ? (
        <InlineMessage tone="warning" className="mt-3">Too many incorrect OTPs. Delivery will be re-attempted.</InlineMessage>
      ) : (
        <form className="mt-4 flex flex-wrap items-start gap-2" noValidate onSubmit={(e) => {
          e.preventDefault();
          if (!otpSchema.safeParse(otp).success) return setError('Enter the 4-digit OTP');
          void act('confirm', { otp });
        }}>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-otp`} className="text-small font-semibold">Delivery OTP</label>
            <Input id={`${id}-otp`} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="one-time-code" maxLength={4} className="w-32 bg-surface text-center text-h4 tracking-[0.3em]" aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} />
          </div>
          <Button type="submit" loading={busy} className="mt-[1.6rem]">Confirm delivery</Button>
        </form>
      )}
      {error && <p id={`${id}-err`} role="alert" className="mt-2 text-small font-semibold text-danger">{error}</p>}
      <div className="mt-4 border-t border-info/20 pt-4">
        <Button variant="secondary" onClick={() => setRejecting(true)} disabled={busy}><PackageX className="size-4" aria-hidden="true" />Customer rejected parcel</Button>
      </div>
      <ConfirmDialog
        open={rejecting}
        onOpenChange={setRejecting}
        title="Customer rejected the parcel?"
        description="The order will be marked Rejected at Delivery and the items returned. A refund for the whole order follows."
        confirmLabel="Reject parcel"
        tone="danger"
        loading={busy}
        onConfirm={() => void act('reject')}
      />
    </section>
  );
}

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const q = useOrder(id);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const unseen = q.data?.hasUnseenUpdate;
  // Opening an order clears its unseen-update dot (PRF-007).
  useEffect(() => {
    if (!unseen) return;
    void api(`/orders/${id}/seen`, { method: 'POST' }).then(() => queryClient.invalidateQueries({ queryKey: ['session'] }));
  }, [id, unseen]);

  if (q.isError && !q.data) {
    if (q.error instanceof ApiError && q.error.code === 'NOT_FOUND') return <PageLayout narrow><EmptyState level={1} title="Order not found" action={<Button asChild variant="secondary"><Link to="/account/orders">Your orders</Link></Button>} /></PageLayout>;
    return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  }
  if (!q.data) return <PageLayout narrow><Skeleton className="h-[32rem] w-full rounded-xl" /></PageLayout>;
  const o = q.data;
  const money = (label: string, value: string, cls?: string) => <div className="flex justify-between gap-4"><dt className="text-ink-soft">{label}</dt><dd className={cn('tabular font-medium', cls)}>{value}</dd></div>;
  return (
    <PageLayout narrow>
      <Link to="/account/orders" className="mb-3 inline-flex min-h-9 items-center gap-1 text-small font-semibold text-ink-muted hover:text-ink"><ChevronLeft className="size-4" aria-hidden="true" />Orders</Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h2 font-bold">Order {o.orderNumber}</h1>
          <p className="text-small text-ink-muted">Placed on {o.date} · Contact {o.contactPhone}</p>
        </div>
        <Badge tone={tone(o.status)} size="md" aria-live="polite">{o.headline}</Badge>
      </div>

      <div className="flex flex-col gap-4">
        {o.retry && (
          <InlineMessage tone="warning">
            This order is waiting for payment. {o.retry.canRetry ? <>You can retry for {o.retry.minutesLeft} more minute{o.retry.minutesLeft === 1 ? '' : 's'}. <Link to={`/orders/${o.id}/pay`} className="font-bold underline">Retry payment</Link></> : 'A payment is being processed.'}
          </InlineMessage>
        )}
        {o.expectedDelivery && !o.deliveredAt && !['CANCELLED', 'REJECTED_AT_DELIVERY', 'RETURNED_TO_ORIGIN'].includes(o.status) && <p className="flex items-center gap-2 font-semibold text-success"><Package className="size-5" aria-hidden="true" />{o.expectedDelivery}</p>}
        {o.deliveredAt && <p className="flex items-center gap-2 font-semibold text-success"><Check className="size-5" aria-hidden="true" />Delivered on {o.deliveredAt}</p>}

        {o.deliveryOtp && o.status === 'OUT_FOR_DELIVERY' && (
          <section aria-label="Your delivery OTP" className="flex flex-wrap items-center gap-4 rounded-xl bg-ink p-5 text-white">
            <KeyRound className="size-7 shrink-0 text-white/70" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-small text-white/80">Share this OTP with the delivery person to receive your order.</p>
              <p className="tabular mt-1 text-display font-bold tracking-[0.3em]">{o.deliveryOtp}</p>
            </div>
          </section>
        )}
        {o.simulator && <DeliverySimulatorPanel key={`${o.simulator.attempt}-${o.simulator.locked}`} o={o} />}

        <OrderTimeline o={o} />

        {o.tracking && (
          <section aria-label="Tracking" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface p-5 text-small">
            <Truck className="size-5 text-ink-muted" aria-hidden="true" />
            <p><span className="font-semibold">{o.tracking.courier}</span><br /><span className="text-ink-muted">Tracking ID </span><span className="tabular font-semibold">{o.tracking.trackingId}</span></p>
          </section>
        )}

        <section aria-label="Items" className="rounded-lg border border-line bg-surface p-5">
          <h2 className="mb-3 font-semibold">Items</h2>
          <ul className="flex flex-col divide-y divide-line">
            {o.lines.map((l) => (
              <li key={l.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <Link to={l.href} tabIndex={-1} aria-hidden="true" className="shrink-0">{l.image && <img src={l.image.url} alt="" width={64} height={85} className="aspect-[3/4] w-16 rounded-md object-cover" loading="lazy" />}</Link>
                <div className="min-w-0 flex-1 text-small">
                  <p className="font-bold">{l.brand}</p>
                  <Link to={l.href} className="line-clamp-1 text-ink-soft hover:underline">{l.name}</Link>
                  <p className="text-ink-muted">Size {l.size} · Qty {l.quantity}</p>
                  {l.cancelled && <p className="mt-1"><Badge tone="danger">Cancelled</Badge>{l.cancelled.reason && <span className="ml-2 text-caption text-ink-muted">{l.cancelled.reason}</span>}</p>}
                  {l.canCancel && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setCancelling(l.id)}>Cancel item</Button>}
                  {!l.returnable && o.status === 'DELIVERED' && <p className="mt-1 text-caption text-ink-muted">Not returnable</p>}
                </div>
                <p className="tabular text-small font-semibold">{l.lineNetPaid.display}</p>
              </li>
            ))}
          </ul>
        </section>

        <RefundList refunds={o.refunds} />

        <div className="grid gap-4 sm:grid-cols-2">
          <section aria-label="Delivery address" className="rounded-lg border border-line bg-surface p-5 text-small">
            <h2 className="mb-2 text-body font-semibold">Delivery address</h2>
            <p className="font-semibold">{o.address.recipientName}</p>
            <p className="text-ink-soft">{o.address.oneLine}</p>
            <p className="text-ink-muted">Phone: {o.address.recipientPhone}</p>
          </section>
          <section aria-label="Payment" className="rounded-lg border border-line bg-surface p-5 text-small">
            <h2 className="mb-2 text-body font-semibold">Payment</h2>
            <dl className="flex flex-col gap-1.5">
              {money('Total MRP', o.amounts.totalMrp.display)}
              {o.amounts.discountOnMrp.paise > 0 && money('Discount on MRP', `−${o.amounts.discountOnMrp.display}`, 'text-success')}
              {o.amounts.couponDiscount.paise > 0 && money(`Coupon ${o.amounts.couponCode ?? ''}`.trim(), `−${o.amounts.couponDiscount.display}`, 'text-success')}
              {o.amounts.bankOfferDiscount.paise > 0 && money('Bank offer', `−${o.amounts.bankOfferDiscount.display}`, 'text-success')}
              {money('Delivery', o.amounts.deliveryCharge.paise ? o.amounts.deliveryCharge.display : 'FREE')}
              <div className="flex justify-between gap-4 border-t border-line pt-2 text-body font-bold"><dt>Order total</dt><dd className="tabular">{o.amounts.total.display}</dd></div>
            </dl>
            <p className="mt-1 text-caption text-ink-muted">{o.amounts.taxText}</p>
            {o.payment.methods.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                {o.payment.methods.map((m, i) => <li key={i} className="flex justify-between gap-3"><span>{m.label} <span className="text-ink-muted">· {m.status}</span></span><span className="tabular font-semibold">{m.amount.display}</span></li>)}
              </ul>
            )}
          </section>
        </div>
      </div>
      {cancelling && <CancelDialog orderId={o.id} lineId={cancelling} onClose={() => setCancelling(null)} />}
    </PageLayout>
  );
}
