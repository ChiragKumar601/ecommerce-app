import { InlineMessage } from '../../components/ui';
import type { CheckoutView } from '../../features/checkout';

/** Payment step (PAY-001…005). Payment and order creation are built in Stage 15. */
export function PaymentStep({ c }: { c: CheckoutView }) {
  return <InlineMessage tone="info">Payment for {c.quote.total.display} is the next step to be built (Stage 15).</InlineMessage>;
}
