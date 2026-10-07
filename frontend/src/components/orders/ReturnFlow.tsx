import { useQuery } from '@tanstack/react-query';
import { Check, MapPin } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { orderKey, type OrderDetail, type ReturnInfo, type ReturnPreview } from '../../features/orders';
import { api, ApiError, errorMessage, newIdempotencyKey } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { InlineMessage, Skeleton } from '../ui/feedback';
import { RadioGroup } from '../ui/form';
import { FormField, Select, Textarea } from '../ui/input';
import { Dialog } from '../ui/overlay';
import { toast } from '../ui/toast';

/**
 * Return flow (RET-002): quantity (1…returnable), reason, optional comment (≤ 500), then a review with
 * the item, the pickup address (the order's address) and the estimated refund, then submit.
 */
export function ReturnFlow({ orderId, lineId, max, onClose }: { orderId: string; lineId: string; max: number; onClose: () => void }) {
  const [quantity, setQuantity] = useState(1);
  const [reason, setReason] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<'details' | 'review'>('details');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const preview = useQuery({
    queryKey: ['return-preview', orderId, lineId, quantity],
    queryFn: () => api<ReturnPreview>(`/orders/${orderId}/lines/${lineId}/return-preview?quantity=${quantity}`),
    placeholderData: (p) => p,
    retry: false,
  });
  const p = preview.data;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const o = await api<OrderDetail>(`/orders/${orderId}/lines/${lineId}/returns`, { method: 'POST', body: { quantity, reason, comment: comment.trim() || undefined }, idempotencyKey: key });
      queryClient.setQueryData(orderKey(orderId), o);
      toast({ title: 'Return requested', description: 'We’ll update you as it moves along.', tone: 'success' });
      onClose();
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors.length ? e.fieldErrors[0]!.message : errorMessage(e));
      if (e instanceof ApiError && e.code === 'ACTION_NOT_ALLOWED') void queryClient.invalidateQueries({ queryKey: orderKey(orderId) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={step === 'details' ? 'Return item' : 'Review return'}
      className="max-w-xl"
      footer={step === 'details' ? (
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={!p} onClick={() => (reason ? (setError(null), setStep('review')) : setError('Choose a reason'))}>Continue</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" onClick={() => setStep('details')} disabled={busy}>Back</Button>
          <Button onClick={() => void submit()} loading={busy}>Submit return</Button>
        </>
      )}
    >
      {preview.isError && !p ? <InlineMessage>{errorMessage(preview.error)}</InlineMessage> : !p ? <Skeleton className="h-48 w-full" /> : (
        <div className="flex flex-col gap-4">
          <div className="flex gap-3 text-small">
            {p.line.image && <img src={p.line.image.url} alt="" width={56} height={75} className="aspect-[3/4] w-14 rounded-md object-cover" />}
            <div>
              <p className="font-bold">{p.line.brand}</p>
              <p className="text-ink-soft">{p.line.name}</p>
              <p className="text-ink-muted">Size {p.line.size} · Ordered {p.line.quantity}</p>
            </div>
          </div>
          {error && <InlineMessage>{error}</InlineMessage>}
          {step === 'details' ? (
            <>
              <FormField label="Quantity to return" className="max-w-40">
                <Select value={String(quantity)} onChange={(e) => setQuantity(Number(e.target.value))}>
                  {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
                </Select>
              </FormField>
              <fieldset>
                <legend className="mb-2 text-small font-semibold">Reason for return</legend>
                <RadioGroup value={reason} onValueChange={(v) => { setReason(v); setError(null); }} options={p.reasons.map((r) => ({ value: r, label: r }))} aria-label="Return reason" />
              </fieldset>
              <FormField label="Comment (optional)" hint={<>Up to 500 characters. <Link to="/demo-help" className="underline">Demo tags</Link> like #approve force an outcome.</>}>
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={3} />
              </FormField>
            </>
          ) : (
            <div className="flex flex-col gap-3 text-small">
              <p>Returning <span className="font-semibold">{quantity}</span> · {reason}{comment.trim() && <span className="text-ink-muted"> · “{comment.trim()}”</span>}</p>
              <section aria-label="Pickup address" className="flex gap-2 rounded-lg border border-line p-3">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <div><p className="font-semibold">Pickup from {p.pickupAddress.recipientName}</p><p className="text-ink-soft">{p.pickupAddress.oneLine}</p></div>
              </section>
              <section aria-label="Estimated refund" className="rounded-lg border border-line bg-surface-muted/50 p-3">
                <p className="text-body font-bold">Estimated refund {p.refund.amount.display}</p>
                <ul className="mt-1">{p.refund.destinations.map((d) => <li key={d.label}>{d.amount.display} to {d.label}</li>)}</ul>
                <p className="mt-1 text-ink-muted">Refunded once the item is picked up.</p>
              </section>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

const DONE = new Set(['REFUNDED']);
const BAD = new Set(['RETURN_REJECTED', 'RETURN_CLOSED']);

/** Return state on an order line (RET-001…005): status, rejection reason, closed message, refund, steps. */
export function ReturnStatus({ info }: { info: ReturnInfo }) {
  if (!info.returns.length) return null;
  return (
    <ul className="mt-2 flex flex-col gap-2">
      {info.returns.map((r) => (
        <li key={r.id} className="rounded-md border border-line p-2.5 text-caption">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone={DONE.has(r.status) ? 'success' : BAD.has(r.status) ? 'danger' : 'info'}>{r.statusLabel}</Badge>
            <span className="text-ink-soft">Return of {r.quantity} · {r.reason}</span>
            {r.refund && <span className="font-semibold">{r.refund.display}</span>}
          </p>
          {r.rejectionReason && <p className="mt-1 text-danger">{r.rejectionReason}</p>}
          {r.closedMessage && <p className="mt-1 text-danger">{r.closedMessage}</p>}
          <ol className="mt-1.5 flex flex-col gap-0.5 text-ink-muted sm:flex-row sm:flex-wrap sm:gap-x-3" aria-label="Return progress">
            {r.history.map((h, i) => (
              <li key={i} className={cn('inline-flex items-center gap-1 whitespace-nowrap', i === r.history.length - 1 && 'font-semibold text-ink')}>
                <Check className="size-3" aria-hidden="true" />{h.label}<span className="sr-only"> at</span><span className="font-normal text-ink-muted">· {h.at.split(', ').at(-1)}</span>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
