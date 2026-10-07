import { useQuery } from '@tanstack/react-query';
import { BadgePercent, ChevronRight, Heart, MapPin, ShieldCheck, ShoppingBag, Tag, Trash2, Truck, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { promptLogin } from '../../components/auth/AuthDialogs';
import { Badge, Button, Dialog, EmptyState, ErrorState, InlineMessage, Input, PageLayout, Select, Skeleton } from '../../components/ui';
import { toast } from '../../components/ui/toast';
import { AddressPicker } from '../../components/address/AddressPicker';
import { AddressDialog } from '../../components/address/AddressFlow';
import { pickDeliveryAddress, selectAddress, useAddresses, useSelectedAddressId } from '../../features/address';
import { bagAction, moveLineToWishlist, useBag, type BagLineView, type BagView } from '../../features/bag';
import { useAccount } from '../../features/session';
import { useWishlistIds } from '../../features/wishlist';
import { api, ApiError, errorMessage } from '../../lib/api-client';
import { cn } from '../../lib/cn';
import { deviceStore, useDevice } from '../../lib/device-store';

/** One bag line (BAG-001…005): image, brand, name, size, quantity, price, flags and actions. */
function BagLine({ line, busy, run }: { line: BagLineView; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const qtyId = useId();
  const options = Array.from({ length: Math.max(line.maxQuantity, line.quantity) }, (_, i) => i + 1);
  const remove = () => run(async () => {
    await bagAction({ type: 'remove', variantId: line.variantId });
    // BAG-003: 5-second Undo.
    toast({
      title: 'Removed from bag',
      description: `${line.brand} ${line.name}`,
      durationMs: 5000,
      action: { label: 'Undo', onClick: () => void bagAction({ type: 'add', variantId: line.variantId, quantity: line.quantity }).catch((e: unknown) => toast({ title: errorMessage(e), tone: 'danger' })) },
    });
  });
  return (
    <li className={cn('flex gap-3 rounded-lg border bg-surface p-3 sm:gap-4 sm:p-4', line.flag ? 'border-danger/40' : 'border-line')} aria-label={`${line.brand} ${line.name}, size ${line.size}`}>
      <Link to={line.href} className="w-24 shrink-0 overflow-hidden rounded-md bg-surface-muted sm:w-28">
        {line.image && <img src={line.image.url} alt={line.image.alt} width={112} height={149} loading="lazy" className={cn('aspect-[3/4] w-full object-cover', line.flag && line.flag !== 'over_stock' && 'opacity-50')} />}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-small font-bold">{line.brand}</p>
            <Link to={line.href} className="line-clamp-2 text-small text-ink-soft hover:underline">{line.name}</Link>
          </div>
          <button type="button" onClick={remove} disabled={busy} aria-label={`Remove ${line.name} from bag`} className="-mr-1 -mt-1 flex size-9 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-50">
            <X className="size-4.5" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-small">
          <Badge tone="outline" size="md">Size: {line.size}</Badge>
          <label htmlFor={qtyId} className="sr-only">Quantity for {line.name}</label>
          <Select
            id={qtyId}
            value={String(line.quantity)}
            disabled={busy || line.flag === 'inactive' || line.flag === 'out_of_stock'}
            onChange={(e) => run(async () => {
              const v = await bagAction({ type: 'set', variantId: line.variantId, quantity: Number(e.target.value) });
              if (v.message) toast({ title: v.message });
            })}
            className="h-9 w-auto min-w-24 rounded-full pl-3 text-small font-semibold"
          >
            {options.map((q) => <option key={q} value={q}>Qty: {q}</option>)}
          </Select>
        </div>
        <p className="tabular mt-1 flex flex-wrap items-baseline gap-x-1.5 text-small">
          <span className="font-bold text-ink">{line.lineValue.display}</span>
          {line.discountPercent > 0 && (
            <>
              <span className="sr-only">, was </span>
              <s className="text-caption text-ink-muted">{line.lineMrp.display}</s>
              <span className="text-caption font-semibold text-sale">({line.discountPercent}% OFF)</span>
            </>
          )}
          {line.quantity > 1 && <span className="text-caption text-ink-muted">· {line.unitPrice.display} each</span>}
        </p>
        {line.priceChange && <p className="text-caption font-semibold text-info">{line.priceChange.message}</p>}
        {line.flagMessage && (
          <div role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-small font-semibold text-danger">
            {line.flagMessage}
            {line.flag === 'over_stock' && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => bagAction({ type: 'set', variantId: line.variantId, quantity: line.available }))}>Set quantity to {line.available}</Button>
            )}
            {line.flag !== 'over_stock' && <Button size="sm" variant="secondary" disabled={busy} onClick={remove}>Remove</Button>}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-x-4 pt-2">
          {line.flag !== 'inactive' && (
            <button type="button" disabled={busy} onClick={() => run(async () => {
              await moveLineToWishlist(line);
              toast({ title: 'Moved to wishlist', description: line.name, tone: 'success' });
            })} className="inline-flex min-h-9 items-center gap-1.5 text-small font-semibold text-ink-soft hover:text-ink disabled:opacity-50">
              <Heart className="size-4" aria-hidden="true" />Move to Wishlist
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Coupon box (BAG-006): one input, applied state with saving and Remove, and the available list. */
function CouponBox({ bag, run, busy }: { bag: BagView; run: (fn: () => Promise<unknown>) => Promise<void>; busy: boolean }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState(false);
  const id = useId();
  const apply = async (c: string) => {
    setError(null);
    try {
      await bagAction({ type: 'applyCoupon', code: c });
      setCode('');
      setList(false);
      toast({ title: `Coupon ${c.toUpperCase()} applied`, tone: 'success' });
    } catch (e) {
      setError(e instanceof ApiError && e.fieldErrors.length ? e.fieldErrors[0]!.message : errorMessage(e));
    }
  };
  const applied = bag.quote.coupon;
  return (
    <section aria-labelledby={`${id}-h`} className="rounded-lg border border-line bg-surface p-4">
      <h2 id={`${id}-h`} className="flex items-center gap-2 text-small font-bold uppercase tracking-wider"><Tag className="size-4" aria-hidden="true" />Coupons</h2>
      {applied ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-md bg-success-soft px-3 py-2.5">
          <p className="text-small"><span className="font-bold text-success">{applied.code}</span> applied · you save <span className="font-semibold">{applied.discount.display}</span></p>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => bagAction({ type: 'removeCoupon' }))}>Remove</Button>
        </div>
      ) : (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void run(() => apply(code.trim())); }}>
          <label htmlFor={id} className="sr-only">Coupon code</label>
          <Input id={id} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter coupon code" maxLength={20} aria-invalid={!!error} aria-describedby={error ? `${id}-err` : undefined} className="uppercase placeholder:normal-case" />
          <Button type="submit" variant="secondary" loading={busy && !!code}>Apply</Button>
        </form>
      )}
      {error && <p id={`${id}-err`} role="alert" className="mt-2 text-caption font-medium text-danger">{error}</p>}
      <button type="button" onClick={() => setList(true)} className="mt-3 inline-flex items-center gap-1 text-small font-semibold text-brand hover:underline">View available coupons<ChevronRight className="size-4" aria-hidden="true" /></button>
      <Dialog open={list} onOpenChange={setList} title="Available coupons">
        <ul className="flex flex-col gap-3">
          {bag.coupons.map((c) => (
            <li key={c.code} className="flex items-start justify-between gap-3 rounded-md border border-line p-3">
              <div>
                <p className="font-bold tracking-wide">{c.code}</p>
                <p className="text-small text-ink-soft">{c.description}</p>
                <p className={cn('mt-1 text-caption font-medium', c.eligible ? 'text-success' : 'text-ink-muted')}>{c.eligible ? `You save ${c.saving!.display}` : c.reason}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!c.eligible || busy || applied?.code === c.code} onClick={() => run(() => apply(c.code))}>
                {applied?.code === c.code ? 'Applied' : 'Apply'}
              </Button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption text-ink-muted">Guests' per-customer limits are checked after login.</p>
      </Dialog>
    </section>
  );
}

/** Price summary from the quote (BAG-009). */
export function PriceSummary({ bag, title = 'Price details' }: { bag: Pick<BagView, 'quote' | 'units'>; title?: string }) {
  const q = bag.quote;
  const row = (label: string, value: string, tone?: string) => (
    <div className="flex justify-between gap-4"><dt className="text-ink-soft">{label}</dt><dd className={cn('tabular font-medium', tone)}>{value}</dd></div>
  );
  return (
    <section aria-label="Price summary" className="rounded-lg border border-line bg-surface p-4">
      <h2 className="text-small font-bold uppercase tracking-wider">{title} ({bag.units} item{bag.units === 1 ? '' : 's'})</h2>
      <dl className="mt-3 flex flex-col gap-2.5 text-small">
        {row('Total MRP', q.totalMrp.display)}
        {q.discountOnMrp.paise > 0 && row('Discount on MRP', `−${q.discountOnMrp.display}`, 'text-success')}
        {q.couponDiscount.paise > 0 && row('Coupon discount', `−${q.couponDiscount.display}`, 'text-success')}
        {q.bankOfferDiscount.paise > 0 && row('Bank offer', `−${q.bankOfferDiscount.display}`, 'text-success')}
        {row('Delivery charge', q.deliveryFree ? 'FREE' : q.deliveryCharge.display, q.deliveryFree ? 'text-success' : undefined)}
        <div className="mt-1 flex justify-between gap-4 border-t border-line pt-3 text-body font-bold"><dt>Total amount</dt><dd className="tabular">{q.total.display}</dd></div>
      </dl>
      <p className="mt-1 text-caption text-ink-muted">{q.taxText}</p>
      {q.freeDeliveryNudge && <p className="mt-3 flex items-center gap-2 rounded-md bg-info-soft px-3 py-2 text-caption font-semibold text-info"><Truck className="size-4 shrink-0" aria-hidden="true" />{q.freeDeliveryNudge}</p>}
    </section>
  );
}

/** Delivery details for customers (BAG-010): the default or selected address with "Change" and "Delivery by". */
function CustomerDelivery() {
  const q = useAddresses();
  const selectedId = useSelectedAddressId();
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const a = pickDeliveryAddress(q.data?.items, selectedId);
  if (!q.data) return <Skeleton className="h-20 w-full rounded-lg" />;
  return (
    <section aria-label="Delivery details" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
      {a ? (
        <div className="flex min-w-0 items-start gap-2 text-small">
          <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p>Deliver to <span className="font-bold">{a.recipientName}, {a.pincode}</span> <span className="text-ink-muted">({a.label})</span></p>
            <p className="truncate text-ink-muted">{a.oneLine}</p>
            <p className={cn('font-semibold', a.serviceable ? 'text-success' : 'text-danger')}>{a.delivery.message}</p>
          </div>
        </div>
      ) : (
        <p className="text-small text-ink-soft">Add an address to see when your order will arrive.</p>
      )}
      <Button size="sm" variant="secondary" onClick={() => (a ? setPicking(true) : setAdding(true))}>{a ? 'Change' : 'Add address'}</Button>
      {picking && <AddressPicker open onOpenChange={setPicking} selectedId={a?.id ?? null} onSelect={(x) => { selectAddress(x.id); setPicking(false); }} />}
      {adding && <AddressDialog open onOpenChange={setAdding} onSaved={(x) => selectAddress(x.id)} />}
    </section>
  );
}

/** Delivery details for guests (BAG-010): remembered pincode with "Delivery by", or a prompt. */
function GuestDelivery() {
  const remembered = useDevice((d) => d.pincode);
  const [editing, setEditing] = useState(!remembered);
  const [value, setValue] = useState(remembered ?? '');
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const r = useQuery({
    queryKey: ['pincode', remembered],
    queryFn: () => api<{ serviceable: boolean; message: string }>(`/pincode/${remembered}`),
    enabled: !!remembered,
    staleTime: 10 * 60_000,
  });
  const save = () => {
    if (!/^[1-9]\d{5}$/.test(value)) return setError('Enter a valid 6-digit pincode');
    setError(null);
    deviceStore.update((d) => ({ ...d, pincode: value }));
    setEditing(false);
  };
  return (
    <section aria-label="Delivery details" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface p-4">
      {editing ? (
        <form className="flex w-full flex-wrap items-start gap-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <label htmlFor={id} className="w-full text-small font-semibold">Check delivery for your pincode</label>
          <Input id={id} inputMode="numeric" maxLength={6} value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} placeholder="Enter pincode" className="max-w-40" aria-invalid={!!error} aria-describedby={error ? `${id}-e` : undefined} />
          <Button type="submit" variant="secondary">Check</Button>
          {error && <p id={`${id}-e`} role="alert" className="w-full text-caption font-medium text-danger">{error}</p>}
        </form>
      ) : (
        <>
          <div className="flex min-w-0 items-start gap-2 text-small">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div>
              <p>Deliver to <span className="font-bold">{remembered}</span></p>
              {r.data && <p className={cn('font-semibold', r.data.serviceable ? 'text-success' : 'text-danger')}>{r.data.serviceable ? r.data.message : `We don't deliver to ${remembered} yet`}</p>}
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>Change</Button>
        </>
      )}
    </section>
  );
}

function BagSkeleton() {
  return (
    <PageLayout>
      <Skeleton className="mb-6 h-9 w-48" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-44 w-full rounded-lg" />)}</div>
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    </PageLayout>
  );
}

/** Bag page (BAG-001…013). */
export function BagPage() {
  const account = useAccount();
  const deviceLines = useDevice((d) => d.bag.length);
  const wishlist = useWishlistIds();
  const bag = useBag({ fresh: true });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const shown = useRef<string | null>(null);

  // BAG-007: an automatically removed coupon is announced once.
  const removed = bag.data?.couponRemoved?.message ?? null;
  useEffect(() => {
    if (removed && shown.current !== removed) {
      shown.current = removed;
      toast({ title: removed, durationMs: 6000 });
    }
  }, [removed]);

  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast({ title: errorMessage(e), tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };

  const empty = (account ? bag.data?.lines.length === 0 : deviceLines === 0) && !bag.isLoading;
  if (empty) {
    return (
      <PageLayout narrow>
        <EmptyState
          level={1}
          icon={<ShoppingBag className="size-7" aria-hidden="true" />}
          title="Your bag is empty"
          description="There's nothing in your bag yet. Let's add some items."
          action={
            <div className="flex flex-col items-center gap-3">
              <Button asChild size="lg"><Link to="/">Continue Shopping</Link></Button>
              {wishlist.size > 0 && <Link to="/wishlist" className="text-small font-semibold text-brand hover:underline">View wishlist</Link>}
            </div>
          }
        />
      </PageLayout>
    );
  }
  if (bag.isLoading || !bag.data) {
    if (bag.isError) return <PageLayout><ErrorState message={errorMessage(bag.error)} onRetry={() => void bag.refetch()} /></PageLayout>;
    return <BagSkeleton />;
  }
  const data = bag.data;
  const proceed = () => {
    if (!account) return promptLogin({ action: 'checkout', title: 'Log in to check out' });
    navigate('/checkout');
  };
  return (
    <PageLayout>
      <h1 className="mb-6 text-h2 font-bold md:text-h1">Bag <span className="text-h4 font-normal text-ink-muted">({data.units} item{data.units === 1 ? '' : 's'})</span></h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-8">
        <div className="flex min-w-0 flex-col gap-4">
          {account ? <CustomerDelivery /> : <GuestDelivery />}
          {data.quote.bankOffer.text && (
            <p className="flex items-start gap-2 rounded-lg border border-line bg-surface p-4 text-small"><BadgePercent className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" /><span className="font-semibold">{data.quote.bankOffer.text}</span></p>
          )}
          {data.blocked && <InlineMessage>Fix the highlighted items in your bag to continue.</InlineMessage>}
          <ul className="flex flex-col gap-3" aria-label="Items in your bag">
            {data.lines.map((l) => <BagLine key={l.variantId} line={l} busy={busy} run={run} />)}
          </ul>
        </div>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:self-start" aria-label="Order summary">
          <CouponBox bag={data} run={run} busy={busy} />
          <PriceSummary bag={data} />
          <Button size="lg" block variant="brand" disabled={data.blocked || busy} onClick={proceed}>Proceed to Checkout</Button>
          <p className="flex items-center justify-center gap-2 text-caption text-ink-muted"><ShieldCheck className="size-4" aria-hidden="true" />Demo store: no real payment is taken</p>
          {data.lines.some((l) => l.flag) && (
            <p className="flex items-center justify-center gap-1.5 text-caption text-ink-muted"><Trash2 className="size-3.5" aria-hidden="true" />Remove unavailable items to continue</p>
          )}
        </aside>
      </div>
    </PageLayout>
  );
}
