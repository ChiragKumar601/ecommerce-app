import type { QuoteChange } from '@app/shared';
import { phoneSchema } from '@app/shared';
import { AlertTriangle, ChevronLeft, Lock, MapPin, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { AddressSummary } from '../../components/address/AddressCard';
import { AddressDialog } from '../../components/address/AddressFlow';
import { Button, Dialog, ErrorState, FormField, InlineMessage, Input, PageLayout, Select, Skeleton, Stepper } from '../../components/ui';
import { toast } from '../../components/ui/toast';
import { selectAddress, useAddresses, useSelectedAddressId } from '../../features/address';
import { changeText, checkoutAction, useCheckout, type CheckoutView, type PendingOrder } from '../../features/checkout';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { queryClient } from '../../lib/query';
import { PriceSummary } from '../bag/BagPage';
import { PaymentStep } from './PaymentStep';

const STEPS = ['Address', 'Summary', 'Payment'];
const STEP_INDEX = { address: 0, summary: 1, payment: 2 } as const;

/** "Some details changed" list with acknowledgement (CHK-002). */
export function ChangeSummary({ changes, onContinue, busy, backTo }: { changes: QuoteChange[]; onContinue: () => void; busy?: boolean; backTo?: { href: string; label: string } }) {
  return (
    <section role="alert" aria-labelledby="changes-h" className="mb-6 rounded-lg border border-warning/30 bg-warning-soft p-4">
      <h2 id="changes-h" className="flex items-center gap-2 font-semibold text-warning"><AlertTriangle className="size-5" aria-hidden="true" />Some details changed:</h2>
      <ul className="mt-2 list-disc pl-6 text-small text-ink">
        {changes.map((c, i) => <li key={i}>{changeText(c)}</li>)}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onContinue} loading={busy}>Continue with these changes</Button>
        {backTo && <Button asChild variant="secondary"><Link to={backTo.href}>{backTo.label}</Link></Button>}
      </div>
    </section>
  );
}

/** Pending-order dialog (CHK-010): retry that order's payment, or cancel it and continue. */
export function PendingOrderDialog({ pending, onCancelled, onClose }: { pending: PendingOrder; onCancelled: () => void; onClose: () => void }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="You have an order waiting for payment"
      description={`Order ${pending.orderNumber} for ${pending.amount} is awaiting payment. You can retry for ${pending.minutesLeft} more minute${pending.minutesLeft === 1 ? '' : 's'}.`}
      footer={
        <>
          <Button variant="secondary" loading={busy} onClick={async () => {
            setBusy(true);
            try {
              await api(`/orders/${pending.orderId}/cancel`, { method: 'POST', body: { reason: 'Changed my mind' } });
              toast({ title: `Order ${pending.orderNumber} cancelled` });
              onCancelled();
            } catch (e) {
              toast({ title: errorMessage(e), tone: 'danger' });
            } finally {
              setBusy(false);
            }
          }}>Cancel pending order</Button>
          <Button onClick={() => navigate(`/orders/${pending.orderId}/pay`)} disabled={busy}>Retry payment</Button>
        </>
      }
    />
  );
}

/**
 * `/checkout` and `/checkout/buy-now?variant=…` start a checkout (BAG-011, PDP-009) and continue at
 * `/checkout?c=<id>`, which reloads and re-logins resume from the server (CHK-007).
 */
export function CheckoutRoute() {
  const [params] = useSearchParams();
  const id = params.get('c');
  return id ? <CheckoutPage id={id} /> : <StartCheckout />;
}

function StartCheckout() {
  const location = useLocation();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const selected = useSelectedAddressId();
  const [pending, setPending] = useState<PendingOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const buyNow = location.pathname.endsWith('/buy-now');
  const variant = params.get('variant');

  const start = async () => {
    setError(null);
    try {
      const body = buyNow ? { source: 'buy_now', variantId: variant, addressId: selected ?? undefined } : { source: 'bag', addressId: selected ?? undefined };
      const v = await api<CheckoutView>('/checkout', { method: 'POST', body });
      queryClient.setQueryData(['checkout', v.id], v);
      navigate(`/checkout?c=${v.id}`, { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'PENDING_ORDER_EXISTS') return setPending(e.details['pending'] as PendingOrder);
      if (e instanceof ApiError && e.code === 'CHECKOUT_BLOCKED') {
        toast({ title: e.message, tone: 'danger' });
        return navigate('/bag', { replace: true });
      }
      if (e instanceof ApiError && (e.code === 'OUT_OF_STOCK' || e.code === 'PRODUCT_INACTIVE')) {
        toast({ title: e.message, tone: 'danger' });
        return navigate(-1);
      }
      setError(errorMessage(e));
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // Runs once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageLayout>
      {error ? <ErrorState message={error} onRetry={() => void start()} /> : <CheckoutSkeleton />}
      {pending && <PendingOrderDialog pending={pending} onClose={() => (buyNow ? navigate(-1) : navigate('/bag'))} onCancelled={() => { setPending(null); void start(); }} />}
    </PageLayout>
  );
}

function CheckoutSkeleton() {
  return (
    <div aria-busy="true">
      <Skeleton className="mb-6 h-8 w-64" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-80 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Phone step (CHK-003): asked only when the account has no phone. */
function PhoneStep({ c }: { c: CheckoutView }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    const r = phoneSchema.safeParse(value);
    if (!r.success) return setError(r.error.issues[0]!.message);
    setError(null);
    setBusy(true);
    try {
      const v = await checkoutAction(c.id, '/phone', 'POST', { phone: value });
      if (v.message) toast({ title: v.message, durationMs: 7000 });
      // The account now has a phone: new addresses default to it (ADDR-002).
      else await queryClient.invalidateQueries({ queryKey: ['session'] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-lg border border-line bg-surface p-5">
      <h2 className="text-h4 font-semibold">Contact number</h2>
      <p className="mt-1 text-small text-ink-muted">We need a mobile number for delivery updates.</p>
      <form className="mt-4 flex flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <FormField label="Mobile number" error={error ?? undefined} className="min-w-56 flex-1" required>
          <Input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => value && setError(phoneSchema.safeParse(value).success ? null : 'Enter a valid 10-digit mobile number')} type="tel" inputMode="tel" autoComplete="tel-national" />
        </FormField>
        <Button type="submit" loading={busy} className="mt-[1.6rem]">Save number</Button>
      </form>
    </section>
  );
}

/** Address step (CHK-004): saved addresses, default preselected; unserviceable ones shown but not selectable. */
function AddressStep({ c, busy, run }: { c: CheckoutView; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const q = useAddresses();
  const [adding, setAdding] = useState(false);
  const choose = (id: string) => run(async () => {
    await checkoutAction(c.id, '/address', 'PUT', { addressId: id });
    selectAddress(id);
  });
  return (
    <div className="flex flex-col gap-4">
      {c.phone.needed ? <PhoneStep c={c} /> : (
        <p className="text-small text-ink-soft">Contact number: <span className="font-semibold text-ink">{c.phone.value}</span>{c.phone.forThisOrderOnly && <span className="text-ink-muted"> (this order only)</span>}</p>
      )}
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h4 font-semibold">Delivery address</h2>
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)} disabled={q.data?.atLimit}><Plus className="size-4" aria-hidden="true" />Add new address</Button>
        </div>
        {!q.data ? <Skeleton className="h-32 w-full" /> : q.data.items.length === 0 ? (
          <p className="flex items-center gap-2 text-ink-muted"><MapPin className="size-4" aria-hidden="true" />Add an address to continue.</p>
        ) : (
          <ul className="flex flex-col gap-3" role="radiogroup" aria-label="Delivery address">
            {q.data.items.map((a) => {
              const on = c.address?.id === a.id;
              return (
                <li key={a.id}>
                  <button type="button" role="radio" aria-checked={on} disabled={!a.serviceable || busy} onClick={() => !on && void choose(a.id)}
                    className={cn('w-full rounded-lg border p-4 text-left transition-colors', on ? 'border-ink shadow-1' : 'border-line hover:border-ink-muted', !a.serviceable && 'cursor-not-allowed bg-surface-muted/60 hover:border-line')}>
                    <AddressSummary a={a} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {adding && <AddressDialog open onOpenChange={setAdding} defaultPhone={c.phone.value} onSaved={(a) => { if (a.serviceable) void choose(a.id); }} />}
    </div>
  );
}

/** Summary step (CHK-005, CHK-006): items, coupon, price summary and the address with Change. */
function SummaryStep({ c, busy, run, onChangeAddress }: { c: CheckoutView; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void>; onChangeAddress: () => void }) {
  const [code, setCode] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const applyCoupon = (value: string | null) => run(async () => {
    setCouponError(null);
    try {
      await checkoutAction(c.id, '/coupon', 'PUT', { code: value });
      setCode('');
    } catch (e) {
      setCouponError(errorMessage(e));
    }
  });
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-lg border border-line bg-surface p-5" aria-label="Items">
        <h2 className="mb-3 text-h4 font-semibold">Items ({c.units})</h2>
        <ul className="flex flex-col divide-y divide-line">
          {c.items.map((i) => (
            <li key={i.variantId} className="flex gap-3 py-3 first:pt-0 last:pb-0">
              {i.image && <img src={i.image.url} alt="" width={64} height={85} className="aspect-[3/4] w-16 shrink-0 rounded-md object-cover" />}
              <div className="min-w-0 flex-1 text-small">
                <p className="font-bold">{i.brand}</p>
                <p className="truncate text-ink-soft">{i.name}</p>
                <p className="text-ink-muted">Size {i.size}{c.source === 'bag' && ` · Qty ${i.quantity}`}</p>
                {i.problem && <p className="font-semibold text-danger">{i.problem}</p>}
                {c.source === 'buy_now' && (
                  <div className="mt-1.5">
                    <label htmlFor={`q-${i.variantId}`} className="sr-only">Quantity</label>
                    <Select id={`q-${i.variantId}`} value={String(i.quantity)} disabled={busy} className="h-9 w-auto min-w-24 rounded-full text-small"
                      onChange={(e) => void run(() => checkoutAction(c.id, '/items', 'PUT', { quantity: Number(e.target.value) }))}>
                      {Array.from({ length: i.maxQuantity }, (_, k) => k + 1).map((q) => <option key={q} value={q}>Qty: {q}</option>)}
                    </Select>
                  </div>
                )}
              </div>
              <p className="tabular shrink-0 text-small font-semibold">{i.lineValue.display}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border border-line bg-surface p-5" aria-label="Coupon">
        <h2 className="mb-3 text-h4 font-semibold">Coupon</h2>
        {c.quote.coupon ? (
          <div className="flex items-center justify-between gap-3 rounded-md bg-success-soft px-3 py-2.5 text-small">
            <span><span className="font-bold text-success">{c.quote.coupon.code}</span> applied · you save <span className="font-semibold">{c.quote.coupon.discount.display}</span></span>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void applyCoupon(null)}>Remove</Button>
          </div>
        ) : (
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void applyCoupon(code.trim()); }}>
            <label htmlFor="co-coupon" className="sr-only">Coupon code</label>
            <Input id="co-coupon" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" maxLength={20} className="uppercase placeholder:normal-case" aria-invalid={!!couponError} aria-describedby={couponError ? 'co-coupon-err' : undefined} />
            <Button type="submit" variant="secondary" disabled={busy}>Apply</Button>
          </form>
        )}
        {couponError && <p id="co-coupon-err" role="alert" className="mt-2 text-caption font-medium text-danger">{couponError}</p>}
        {!c.quote.coupon && c.coupons.length > 0 && <p className="mt-2 text-caption text-ink-muted">Available: {c.coupons.map((x) => x.code).join(', ')}</p>}
      </section>
      {c.address && (
        <section className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-5" aria-label="Delivery address">
          <AddressSummary a={c.address} />
          <Button size="sm" variant="secondary" onClick={onChangeAddress}>Change</Button>
        </section>
      )}
    </div>
  );
}

function CheckoutPage({ id }: { id: string }) {
  const q = useCheckout(id);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
      void q.refetch(); // ERR-003
    } finally {
      setBusy(false);
    }
  };
  if (q.isError && !q.data) {
    if (q.error instanceof ApiError && q.error.code === 'NOT_FOUND') {
      return <PageLayout><ErrorState message="This checkout has expired. Please start again from your bag." onRetry={() => navigate('/bag')} /></PageLayout>;
    }
    return <PageLayout><ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} /></PageLayout>;
  }
  if (!q.data) return <PageLayout><CheckoutSkeleton /></PageLayout>;
  const c = q.data;
  const step = STEP_INDEX[c.step];
  const go = (s: 'address' | 'summary' | 'payment') => run(() => checkoutAction(c.id, '/step', 'PUT', { step: s }));
  const canLeaveAddress = !c.phone.needed && !!c.address;
  const blocked = c.items.some((i) => i.problem);
  return (
    <PageLayout>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {step > 0 ? (
            <button type="button" onClick={() => void go(step === 2 ? 'summary' : 'address')} className="flex size-10 items-center justify-center rounded-full hover:bg-surface-muted" aria-label="Back to the previous step"><ChevronLeft className="size-5" aria-hidden="true" /></button>
          ) : (
            <Link to={c.source === 'bag' ? '/bag' : c.items[0]?.href ?? '/'} className="flex size-10 items-center justify-center rounded-full hover:bg-surface-muted" aria-label={c.source === 'bag' ? 'Back to bag' : 'Back to the product'}><ChevronLeft className="size-5" aria-hidden="true" /></Link>
          )}
          <h1 className="text-h2 font-bold">Checkout</h1>
        </div>
        <Stepper steps={STEPS} current={step} />
      </div>
      {c.changes.length > 0 && (
        <ChangeSummary changes={c.changes} busy={busy} onContinue={() => void run(() => checkoutAction(c.id, '/acknowledge', 'POST'))} backTo={c.source === 'bag' ? { href: '/bag', label: 'Back to bag' } : undefined} />
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="min-w-0">
          {c.step === 'address' && <AddressStep c={c} busy={busy} run={run} />}
          {c.step === 'summary' && <SummaryStep c={c} busy={busy} run={run} onChangeAddress={() => void go('address')} />}
          {c.step === 'payment' && <PaymentStep c={c} />}
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start" aria-label="Order summary">
          <PriceSummary bag={c} />
          {c.step === 'address' && (
            <Button size="lg" variant="brand" block disabled={!canLeaveAddress || busy || c.changes.length > 0} onClick={() => void go('summary')}>Continue</Button>
          )}
          {c.step === 'summary' && (
            <Button size="lg" variant="brand" block disabled={busy || blocked || c.changes.length > 0} onClick={() => void go('payment')}>Continue to Payment</Button>
          )}
          {blocked && <InlineMessage>Some items are no longer available. <Link to="/bag" className="underline">Review your bag</Link>.</InlineMessage>}
          <p className="flex items-center justify-center gap-2 text-caption text-ink-muted"><Lock className="size-3.5" aria-hidden="true" />Demo checkout <ShieldCheck className="size-3.5" aria-hidden="true" />No real payment is taken</p>
        </aside>
      </div>
    </PageLayout>
  );
}
