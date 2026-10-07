import { XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PaymentForm } from '../../components/checkout/PaymentForm';
import { Button } from '../../components/ui';
import { checkoutAction, checkoutKey, type CheckoutView } from '../../features/checkout';
import type { AttemptView, QuoteSelection } from '../../features/payment';
import { api } from '../../lib/api-client';
import { queryClient } from '../../lib/query';

/** Payment failed, cancelled or timed out (PAY-010): the message, Retry payment and the time left. */
export function UnsuccessfulPayment({ attempt }: { attempt: AttemptView }) {
  const navigate = useNavigate();
  return (
    <section role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger/25 bg-surface p-6 text-center">
      <XCircle className="size-12 text-danger" aria-hidden="true" />
      <h2 className="text-h3 font-bold">{attempt.message}</h2>
      <p className="text-ink-soft">Order {attempt.order.orderNumber} is waiting for payment. Your items are held and your bag is unchanged.</p>
      {attempt.order.canRetry ? (
        <>
          <p className="text-small font-semibold text-warning">You can retry for {attempt.order.minutesLeft} more minute{attempt.order.minutesLeft === 1 ? '' : 's'}.</p>
          <Button size="lg" onClick={() => navigate(`/orders/${attempt.order.id}/pay`)}>Retry payment</Button>
        </>
      ) : (
        <Button asChild variant="secondary"><Link to={`/account/orders/${attempt.order.id}`}>View order</Link></Button>
      )}
    </section>
  );
}

/** The Payment step of checkout (PAY-001…010). */
export function PaymentStep({ c }: { c: CheckoutView }) {
  const navigate = useNavigate();
  const [failed, setFailed] = useState<AttemptView | null>(null);
  if (failed) return <UnsuccessfulPayment attempt={failed} />;
  const s = c.selection;
  const initial: QuoteSelection = {
    giftCardId: s.giftCardId, useCredits: s.useCredits, method: s.method,
    savedCardId: s.card && 'savedCardId' in s.card ? s.card.savedCardId : undefined,
  };
  const placed = (a: AttemptView) => {
    void queryClient.invalidateQueries({ queryKey: ['bag'] });
    void queryClient.invalidateQueries({ queryKey: ['me'] });
    navigate(`/order-confirmation/${a.order.id}`, { replace: true });
  };
  return (
    <PaymentForm
      quote={c.quote}
      quoteId={c.quoteId}
      initial={initial}
      requote={async (sel) => {
        await checkoutAction(c.id, '/payment-selection', 'PUT', sel);
      }}
      submit={(payment, idempotencyKey) => api<AttemptView>(`/checkout/${c.id}/pay`, { method: 'POST', body: { quoteId: c.quoteId, payment }, idempotencyKey })}
      onPlaced={placed}
      onUnsuccessful={(a) => {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
        setFailed(a);
      }}
      onStale={async () => {
        await queryClient.invalidateQueries({ queryKey: checkoutKey(c.id) });
      }}
    />
  );
}
