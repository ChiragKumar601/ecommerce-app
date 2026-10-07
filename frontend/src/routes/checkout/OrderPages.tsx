import type { Money } from '@app/shared';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { PaymentForm } from '../../components/checkout/PaymentForm';
import { Button, EmptyState, ErrorState, PageLayout, Skeleton } from '../../components/ui';
import type { QuoteView } from '../../features/bag';
import type { AttemptView, QuoteSelection } from '../../features/payment';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { queryClient } from '../../lib/query';
import { PriceSummary } from '../bag/BagPage';
import { UnsuccessfulPayment } from './PaymentStep';

interface OrderPayQuote {
  order: { id: string; orderNumber: string; retryEndsAt: string; minutesLeft: number };
  items: { name: string; brand: string; size: string; image: { url: string; alt: string } | null; quantity: number; lineValue: Money }[];
  units: number;
  quote: QuoteView;
  quoteId: string;
}

const NO_SELECTION: QuoteSelection = { giftCardId: null, useCredits: false, method: null };

/**
 * Retry payment for an Awaiting Payment order (PAY-011, PAY-015): items and prices are locked; the
 * method, card, UPI ID, gift card or credits may change. Outside the window: "This order can no longer be paid".
 */
export function OrderPayPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [sel, setSel] = useState<QuoteSelection>(NO_SELECTION);
  const [failed, setFailed] = useState<AttemptView | null>(null);
  const key = ['order-pay', id, sel] as const;
  const q = useQuery({ queryKey: key, queryFn: () => api<OrderPayQuote>(`/orders/${id}/payment-quote`, { method: 'POST', body: sel }), placeholderData: (p) => p, retry: false });

  if (q.error instanceof ApiError && (q.error.code === 'ORDER_NOT_PAYABLE' || q.error.code === 'NOT_FOUND')) {
    return (
      <PageLayout narrow>
        <EmptyState level={1} icon={<Clock className="size-7" aria-hidden="true" />} title={q.error.code === 'NOT_FOUND' ? "We couldn't find that." : 'This order can no longer be paid.'}
          action={<Button asChild variant="secondary"><Link to={q.error.code === 'NOT_FOUND' ? '/account/orders' : `/account/orders/${id}`}>View order</Link></Button>} />
      </PageLayout>
    );
  }
  if (q.isError && !q.data) return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  if (!q.data) return <PageLayout><Skeleton className="h-96 w-full rounded-lg" /></PageLayout>;
  const d = q.data;
  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-h2 font-bold">Retry payment</h1>
        <p className="mt-1 text-ink-muted">Order {d.order.orderNumber} · {d.order.minutesLeft} minute{d.order.minutesLeft === 1 ? '' : 's'} left to pay</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="min-w-0">
          {failed ? <UnsuccessfulPayment attempt={failed} /> : (
            <PaymentForm
              key={failed ? 'again' : 'first'}
              quote={d.quote}
              quoteId={d.quoteId}
              initial={sel}
              requote={async (s) => {
                const next = await api<OrderPayQuote>(`/orders/${id}/payment-quote`, { method: 'POST', body: s });
                queryClient.setQueryData(['order-pay', id, s], next);
                setSel(s);
              }}
              submit={(payment, idempotencyKey) => api<AttemptView>(`/orders/${id}/retry-payment`, { method: 'POST', body: { quoteId: d.quoteId, payment }, idempotencyKey })}
              onPlaced={(a) => {
                void queryClient.invalidateQueries({ queryKey: ['bag'] });
                void queryClient.invalidateQueries({ queryKey: ['me'] });
                navigate(`/order-confirmation/${a.order.id}`, { replace: true });
              }}
              onUnsuccessful={(a) => setFailed(a)}
              onStale={async () => {
                await q.refetch();
              }}
            />
          )}
        </div>
        <aside className="flex flex-col gap-4 lg:self-start" aria-label="Order summary">
          <section className="rounded-lg border border-line bg-surface p-4" aria-label="Items">
            <h2 className="mb-3 text-small font-bold uppercase tracking-wider">Items (locked)</h2>
            <ul className="flex flex-col gap-3">
              {d.items.map((i, k) => (
                <li key={k} className="flex gap-3 text-small">
                  {i.image && <img src={i.image.url} alt="" width={48} height={64} className="aspect-[3/4] w-12 rounded-sm object-cover" />}
                  <div className="min-w-0 flex-1"><p className="font-semibold">{i.brand}</p><p className="truncate text-ink-soft">{i.name} · {i.size} · Qty {i.quantity}</p></div>
                  <p className="tabular font-semibold">{i.lineValue.display}</p>
                </li>
              ))}
            </ul>
          </section>
          <PriceSummary bag={d} />
        </aside>
      </div>
    </PageLayout>
  );
}

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
  statusLabel: string;
  expectedDelivery: string | null;
  address: { recipientName: string; oneLine: string; recipientPhone: string };
  lines: { id: string; name: string; brand: string; size: string; image: { url: string; alt: string } | null; quantity: number; lineNetPaid: Money }[];
  amounts: { total: Money; taxText: string };
  payment: { paidOnline: Money; giftCard: Money; credits: Money; codDue: Money | null; methods: { label: string; amount: Money; status: string }[] };
}

/** Order confirmation (PAY-013). */
export function ConfirmationPage() {
  const { id = '' } = useParams();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  if (q.isError) return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  if (!q.data) return <PageLayout narrow><Skeleton className="h-96 w-full rounded-xl" /></PageLayout>;
  const o = q.data;
  const placed = o.status !== 'AWAITING_PAYMENT' && o.status !== 'FAILED' && o.status !== 'CANCELLED';
  const row = (label: string, value: string) => <div className="flex justify-between gap-4"><dt className="text-ink-soft">{label}</dt><dd className="tabular font-semibold">{value}</dd></div>;
  return (
    <PageLayout narrow>
      <div className="flex flex-col items-center gap-2 text-center">
        {placed ? <CheckCircle2 className="size-14 text-success" aria-hidden="true" /> : <Clock className="size-14 text-warning" aria-hidden="true" />}
        <h1 className="text-h2 font-bold md:text-h1">{placed ? 'Order placed' : o.statusLabel}</h1>
        <p className="text-ink-soft">Order number <span className="font-bold text-ink">{o.orderNumber}</span></p>
        {o.expectedDelivery && <p className="flex items-center gap-2 font-semibold text-success"><PackageCheck className="size-5" aria-hidden="true" />{o.expectedDelivery}</p>}
      </div>
      <section className="mt-8 rounded-xl border border-line bg-surface p-5" aria-label="Items">
        <h2 className="mb-3 font-semibold">Items</h2>
        <ul className="flex flex-col gap-3">
          {o.lines.map((l) => (
            <li key={l.id} className="flex gap-3 text-small">
              {l.image && <img src={l.image.url} alt="" width={56} height={75} className="aspect-[3/4] w-14 rounded-md object-cover" />}
              <div className="min-w-0 flex-1"><p className="font-semibold">{l.brand}</p><p className="truncate text-ink-soft">{l.name}</p><p className="text-ink-muted">Size {l.size} · Qty {l.quantity}</p></div>
              <p className="tabular font-semibold">{l.lineNetPaid.display}</p>
            </li>
          ))}
        </ul>
      </section>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl border border-line bg-surface p-5 text-small" aria-label="Delivery address">
          <h2 className="mb-2 text-body font-semibold">Delivering to</h2>
          <p className="font-semibold">{o.address.recipientName}</p>
          <p className="text-ink-soft">{o.address.oneLine}</p>
          <p className="text-ink-muted">Phone: {o.address.recipientPhone}</p>
        </section>
        <section className="rounded-xl border border-line bg-surface p-5 text-small" aria-label="Payment">
          <h2 className="mb-2 text-body font-semibold">Payment</h2>
          <dl className="flex flex-col gap-1.5">
            {o.payment.paidOnline.paise > 0 && row('Paid online', o.payment.paidOnline.display)}
            {o.payment.giftCard.paise > 0 && row('Paid by gift card', o.payment.giftCard.display)}
            {o.payment.credits.paise > 0 && row('Paid with credits', o.payment.credits.display)}
            {o.payment.codDue && <div className="flex justify-between gap-4 font-semibold text-warning"><dt>Pay {o.payment.codDue.display} on delivery</dt></div>}
            <div className="mt-1 flex justify-between gap-4 border-t border-line pt-2 text-body font-bold"><dt>Order total</dt><dd className="tabular">{o.amounts.total.display}</dd></div>
          </dl>
          <p className="mt-1 text-caption text-ink-muted">{o.amounts.taxText}</p>
        </section>
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="secondary" size="lg"><Link to={`/account/orders/${o.id}`}>View order details</Link></Button>
        <Button asChild size="lg"><Link to="/">Continue Shopping</Link></Button>
      </div>
    </PageLayout>
  );
}
