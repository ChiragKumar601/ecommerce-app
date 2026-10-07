import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { orderKey, type CancelPreview, type OrderDetail } from '../../features/orders';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api-client';
import { queryClient } from '../../lib/query';
import { Button } from '../ui/button';
import { InlineMessage, Skeleton } from '../ui/feedback';
import { RadioGroup } from '../ui/form';
import { FormField, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlay';
import { toast } from '../ui/toast';

/**
 * Cancel an item (CNL-003): the item, a reason (CNL-005) and an optional comment, then a review of the
 * refund amount and where it goes (RFD-001/002) before confirming. The whole line is cancelled (SD-52).
 */
export function CancelDialog({ orderId, lineId, onClose }: { orderId: string; lineId: string; onClose: () => void }) {
  const preview = useQuery({ queryKey: ['cancel-preview', orderId, lineId], queryFn: () => api<CancelPreview>(`/orders/${orderId}/lines/${lineId}/cancel-preview`), retry: false });
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<'reason' | 'review'>('reason');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const p = preview.data;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const o = await api<OrderDetail>(`/orders/${orderId}/lines/${lineId}/cancel`, { method: 'POST', body: { reason, comment: comment.trim() || undefined }, idempotencyKey: key });
      queryClient.setQueryData(orderKey(orderId), o);
      toast({ title: 'Item cancelled', description: p && p.refund.amount.paise > 0 ? `Refund of ${p.refund.amount.display} initiated` : undefined, tone: 'success' });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      // ERR-003: refresh the order before the customer continues.
      if (e instanceof ApiError && e.code === 'ACTION_NOT_ALLOWED') void queryClient.invalidateQueries({ queryKey: orderKey(orderId) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={step === 'reason' ? 'Cancel item' : 'Review cancellation'}
      footer={
        step === 'reason' ? (
          <>
            <Button variant="secondary" onClick={onClose}>Keep item</Button>
            <Button onClick={() => (reason ? setStep('review') : setError('Choose a reason'))} disabled={!p}>Continue</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setStep('reason')} disabled={busy}>Back</Button>
            <Button variant="danger" onClick={() => void confirm()} loading={busy}>Cancel item</Button>
          </>
        )
      }
    >
      {preview.isError ? (
        <InlineMessage>{errorMessage(preview.error)}</InlineMessage>
      ) : !p ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 text-small">
            {p.line.image && <img src={p.line.image.url} alt="" width={56} height={75} className="aspect-[3/4] w-14 rounded-md object-cover" />}
            <div>
              <p className="font-bold">{p.line.brand}</p>
              <p className="text-ink-soft">{p.line.name}</p>
              <p className="text-ink-muted">Size {p.line.size} · Qty {p.line.quantity} · {p.line.lineNetPaid.display}</p>
            </div>
          </div>
          {error && <InlineMessage>{error}</InlineMessage>}
          {step === 'reason' ? (
            <>
              <fieldset>
                <legend className="mb-2 text-small font-semibold">Why are you cancelling?</legend>
                <RadioGroup value={reason} onValueChange={(v) => { setReason(v); setError(null); }} options={p.reasons.map((r) => ({ value: r, label: r }))} aria-label="Cancellation reason" />
              </fieldset>
              <FormField label="Comment (optional)">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} />
              </FormField>
            </>
          ) : (
            <section aria-label="Refund" className="rounded-lg border border-line bg-surface-muted/50 p-4 text-small">
              <p className="text-ink-soft">Reason: <span className="font-semibold text-ink">{reason}</span></p>
              {p.refund.amount.paise > 0 ? (
                <>
                  <p className="mt-2 text-body font-bold">Refund {p.refund.amount.display}</p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {p.refund.destinations.map((d) => <li key={d.label}>{d.amount.display} to {d.label}</li>)}
                  </ul>
                  {p.includesDeliveryCharge && <p className="mt-1 text-ink-muted">Includes the {p.deliveryCharge.display} delivery charge, as this is the last item.</p>}
                  <p className="mt-2 text-ink-muted">Refunds are processed shortly after cancellation.</p>
                </>
              ) : (
                <p className="mt-2 font-semibold">Nothing was charged for this item, so there is no refund.</p>
              )}
              {p.codNoLongerDue && <p className="mt-2">You'll pay {p.codNoLongerDue.display} less on delivery.</p>}
              {p.lastLine && <p className="mt-2 font-semibold text-danger">This is the last item: the whole order will be cancelled.</p>}
            </section>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Refunds on an order (RFD-006): amount, destinations, status with timestamps, and the trigger. */
export function RefundList({ refunds }: { refunds: OrderDetail['refunds'] }) {
  if (refunds.length === 0) return null;
  return (
    <section aria-labelledby="refunds-h" className="rounded-lg border border-line bg-surface p-5">
      <h2 id="refunds-h" className="mb-3 font-semibold">Refunds</h2>
      <ul className="flex flex-col divide-y divide-line">
        {refunds.map((r) => (
          <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-small first:pt-0 last:pb-0">
            <div className="min-w-0">
              <p className="font-semibold">{r.amount.display} · {r.triggerLabel}{r.includesDeliveryCharge && <span className="font-normal text-ink-muted"> (incl. delivery)</span>}</p>
              <p className="text-ink-soft">{r.summary}</p>
              <p className="text-caption text-ink-muted">Initiated {r.initiatedAt}{r.refundedAt && ` · Refunded ${r.refundedAt}`}</p>
            </div>
            <span className={r.status === 'refunded' ? 'rounded-full bg-success-soft px-2.5 py-1 text-caption font-semibold text-success' : 'rounded-full bg-warning-soft px-2.5 py-1 text-caption font-semibold text-warning'}>{r.statusLabel}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
